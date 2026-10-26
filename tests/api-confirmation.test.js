const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.TZ = 'UTC';

const api = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Beautes - API Kanban Dashboard (2).json'), 'utf8'));
const byName = (name) => api.nodes.find((node) => node.name === name);

test('API workflow has no dangling connections and every node is reachable', () => {
    const names = new Set(api.nodes.map((node) => node.name));
    assert.equal(names.size, api.nodes.length, 'node names must be unique');
    const targets = new Set();
    for (const [source, outputs] of Object.entries(api.connections)) {
        assert.ok(names.has(source), `source "${source}" must exist`);
        for (const branch of outputs.main || []) for (const target of branch) { assert.ok(names.has(target.node), `"${source}" points to missing "${target.node}"`); targets.add(target.node); }
    }
    for (const node of api.nodes.filter((item) => !/webhook/i.test(item.type))) assert.ok(targets.has(node.name), `"${node.name}" has no incoming connection`);
    for (const node of api.nodes.filter((item) => item.type === 'n8n-nodes-base.code')) assert.doesNotThrow(() => new Function('$json', '$', node.parameters.jsCode), `${node.name} must compile`);
});

test('confirmation graph routes a first delivery through database, receipt and panel response', () => {
    const chain = [];
    let name = 'POST Confirmar Cliente';
    while (name) { chain.push(name); name = (api.connections[name]?.main?.[name === 'Confirmação já enviada?' ? 1 : 0] || [])[0]?.node; }
    assert.deepEqual(chain, [
        'POST Confirmar Cliente', 'Validar Sessão POST', 'Extrair Dados', 'Buscar Agendamento Pendente', 'Validar Agendamento Salvo',
        'Atualizar Banco', 'Preparar Mensagem Confirmação', 'Ler Estado Agendamento (API)', 'Marcar Estado Confirmado',
        'Salvar Estado Confirmado', 'Ler Recibo Confirmação', 'Confirmação já enviada?', 'Reivindicar Envio Confirmação',
        'Primeiro envio da confirmação?', 'Avisar Cliente Confirmado', 'Salvar Recibo Confirmação', 'Liberar Envio Confirmação', 'Responder ao HTML'
    ]);
});

test('the confirmation message and the session state use the persisted appointment', () => {
    const record = { external_conversation_id: '5522999999999@s.whatsapp.net', remote_jid: '5522999999999@s.whatsapp.net', service: 'serviço:endolaser', service_tag: 'serviço:endolaser', data_agendamento: '2026-10-16T14:00:00-03:00', tenant_slug: 'beautes' };
    const store = { 'Validar Agendamento Salvo': { item: { json: record } } };
    const prepared = new Function('$json', '$', byName('Preparar Mensagem Confirmação').parameters.jsCode)({}, (n) => store[n]).json;
    assert.equal(prepared.alert_service, 'Endolaser');
    assert.equal(prepared.alert_time, '14h');
    assert.match(prepared.alert_weekday, /sexta/i);
    assert.equal(prepared.alert_date, '16/10');

    store['Preparar Mensagem Confirmação'] = { item: { json: prepared } };
    const sameSchedule = JSON.stringify({ service_tag: 'serviço:endolaser', scheduled_at: '2026-10-16T14:00:00-03:00', customer_confirmed: true });
    const confirmed = new Function('$json', '$', byName('Marcar Estado Confirmado').parameters.jsCode)({ booking_state_raw: sameSchedule }, (n) => store[n]).json;
    assert.equal(confirmed.booking_state.system_confirmed, true);
    assert.equal(confirmed.booking_state.confirmed_scheduled_at, '2026-10-16T14:00:00-03:00');

    const changed = JSON.stringify({ service_tag: 'serviço:endolaser', scheduled_at: '2026-10-17T10:00:00-03:00', customer_confirmed: true });
    const notConfirmed = new Function('$json', '$', byName('Marcar Estado Confirmado').parameters.jsCode)({ booking_state_raw: changed }, (n) => store[n]).json;
    assert.notEqual(notConfirmed.booking_state.system_confirmed, true, 'a different schedule in the conversation must not be marked as confirmed');

    const expired = new Function('$json', '$', byName('Marcar Estado Confirmado').parameters.jsCode)({}, (n) => store[n]).json;
    assert.notEqual(expired.booking_state.system_confirmed, true);

    const message = byName('Avisar Cliente Confirmado').parameters.messageText;
    assert.ok(message.includes("'\\u200B'"), 'the customer message must carry the invisible bot signature, otherwise the bot would pause itself');
    assert.ok(!message.includes('Preparar Alerta Agendamento'), 'must not reference the removed node');
});

test('beautes-agenda-dia manages active scheduling day in API workflow', () => {
    const chain = [];
    let name = 'POST Configurar Agenda';
    while (name && name !== 'É Salvar Dia?') { chain.push(name); name = (api.connections[name]?.main?.[0] || [])[0]?.node; }
    chain.push('É Salvar Dia?');
    assert.deepEqual(chain, [
        'POST Configurar Agenda', 'Validar Sessão Agenda', 'Processar Ação Agenda', 'É Salvar Dia?'
    ]);

    const saveBranch = api.connections['É Salvar Dia?']?.main?.[0]?.[0]?.node;
    assert.equal(saveBranch, 'Salvar Dia no Redis');
    const readBranch = api.connections['É Salvar Dia?']?.main?.[1]?.[0]?.node;
    assert.equal(readBranch, 'Ler Dia no Redis');

    // Test Processar Ação Agenda logic
    const processNode = byName('Processar Ação Agenda');
    const setAction = new Function('$json', '$', processNode.parameters.jsCode)({}, () => ({ item: { json: { body: { action: 'set', dia_aberto: 'terca' } } } })).json;
    assert.equal(setAction.action, 'set');
    assert.equal(setAction.isSet, true);
    assert.equal(setAction.dia_aberto, 'terca');

    const getAction = new Function('$json', '$', processNode.parameters.jsCode)({}, () => ({ item: { json: { body: { action: 'get' } } } })).json;
    assert.equal(getAction.action, 'get');
    assert.equal(getAction.isSet, false);
    assert.equal(getAction.dia_aberto, 'segunda');
});

test('Painel_Amanda.html has sequential agenda bar and control functions', () => {
    const panelPath = path.join(__dirname, '..', 'Painel_Amanda.html');
    const panelHtml = fs.readFileSync(panelPath, 'utf8');
    assert.ok(panelHtml.includes('id="selectDiaAtivo"'), 'must have day selector');
    assert.ok(panelHtml.includes('id="badgeVagasDia"'), 'must have vacancies badge');
    assert.ok(panelHtml.includes('avancarProximoDiaAgenda()'), 'must have advance day button');
    assert.ok(panelHtml.includes('carregarDiaAgenda'), 'must have carregarDiaAgenda function');
    assert.ok(panelHtml.includes('alterarDiaAgenda'), 'must have alterarDiaAgenda function');
    assert.ok(panelHtml.includes('beautes-agenda-dia'), 'must call beautes-agenda-dia webhook');
});

test('beautes-pos-preenchimento endpoint sends lip filler art and recommendations with bot signature', () => {
    const chain = [];
    let name = 'POST Enviar Pos-Preenchimento';
    while (name) { chain.push(name); name = (api.connections[name]?.main?.[0] || [])[0]?.node; }
    assert.deepEqual(chain, [
        'POST Enviar Pos-Preenchimento', 'Validar Sessão Pos-Preenchimento', 'Preparar Mensagem Pos-Preenchimento',
        'Enviar Arte Pos-Preenchimento', 'Enviar Texto Pos-Preenchimento', 'Responder Pos-Preenchimento'
    ]);

    const prepNode = byName('Preparar Mensagem Pos-Preenchimento');
    const store = { 'POST Enviar Pos-Preenchimento': { item: { json: { body: { remoteJid: '22999998888', nome: 'Mariana Silva' } } } } };
    const prepResult = new Function('$json', '$', prepNode.parameters.jsCode)({}, (n) => store[n]).json;

    assert.equal(prepResult.remoteJid, '5522999998888@s.whatsapp.net');
    assert.equal(prepResult.nome, 'Mariana');
    assert.ok(prepResult.mediaUrl.includes('pos_preenchimento_labial.jpg'));
    assert.ok(prepResult.caption.endsWith('\u200B'), 'caption must end with invisible bot signature');
    assert.ok(prepResult.textoRecomendacoes.endsWith('\u200B'), 'text must end with invisible bot signature');
    assert.ok(prepResult.textoRecomendacoes.includes('Dexametasona 4 mg'));
    assert.ok(prepResult.textoRecomendacoes.includes('Compressa Gelada'));
    assert.ok(prepResult.textoRecomendacoes.includes('Hidratação Constante'));

    // Test Botox payload
    const storeBotox = { 'POST Enviar Pos-Preenchimento': { item: { json: { body: { remoteJid: '22988887777', nome: 'Carla Dias', tipo: 'botox' } } } } };
    const botoxResult = new Function('$json', '$', prepNode.parameters.jsCode)({}, (n) => storeBotox[n]).json;

    assert.equal(botoxResult.remoteJid, '5522988887777@s.whatsapp.net');
    assert.equal(botoxResult.nome, 'Carla');
    assert.equal(botoxResult.tipo, 'botox');
    assert.ok(botoxResult.mediaUrl.includes('pos_botox.jpg'));
    assert.ok(botoxResult.caption.endsWith('\u200B'), 'botox caption must end with invisible bot signature');
    assert.ok(botoxResult.textoRecomendacoes.endsWith('\u200B'), 'botox text must end with invisible bot signature');
    assert.ok(botoxResult.textoRecomendacoes.includes('NAS PRIMEIRAS 4 HORAS'));
    assert.ok(botoxResult.textoRecomendacoes.includes('Não deitar e não abaixar a cabeça'));
    assert.ok(botoxResult.textoRecomendacoes.includes('DURANTE 7 DIAS'));

    // Test Endolaser payload
    const storeEndolaser = { 'POST Enviar Pos-Preenchimento': { item: { json: { body: { remoteJid: '22977776666', nome: 'Renata Lima', tipo: 'endolaser' } } } } };
    const endolaserResult = new Function('$json', '$', prepNode.parameters.jsCode)({}, (n) => storeEndolaser[n]).json;

    assert.equal(endolaserResult.remoteJid, '5522977776666@s.whatsapp.net');
    assert.equal(endolaserResult.nome, 'Renata');
    assert.equal(endolaserResult.tipo, 'endolaser');
    assert.ok(endolaserResult.mediaUrl.includes('pos_endolaser.jpg'));
    assert.ok(endolaserResult.caption.endsWith('\u200B'), 'endolaser caption must end with invisible bot signature');
    assert.ok(endolaserResult.textoRecomendacoes.endsWith('\u200B'), 'endolaser text must end with invisible bot signature');
    assert.ok(endolaserResult.textoRecomendacoes.includes('USO DA CINTA POR 45 DIAS'));
    assert.ok(endolaserResult.textoRecomendacoes.includes('DRENAGENS PÓS-ENDOLASER PRO'));
    assert.ok(endolaserResult.textoRecomendacoes.includes('COMPRESSA GELADA'));

    // Test Cirurgia Estética da Face payload
    const storeCirurgia = { 'POST Enviar Pos-Preenchimento': { item: { json: { body: { remoteJid: '22966665555', nome: 'Luciana Martins', tipo: 'cirurgia_face' } } } } };
    const cirurgiaResult = new Function('$json', '$', prepNode.parameters.jsCode)({}, (n) => storeCirurgia[n]).json;

    assert.equal(cirurgiaResult.remoteJid, '5522966665555@s.whatsapp.net');
    assert.equal(cirurgiaResult.nome, 'Luciana');
    assert.equal(cirurgiaResult.tipo, 'cirurgia_face');
    assert.ok(cirurgiaResult.mediaUrl.includes('pos_cirurgia_face.jpg'));
    assert.ok(cirurgiaResult.caption.endsWith('\u200B'), 'cirurgia caption must end with invisible bot signature');
    assert.ok(cirurgiaResult.textoRecomendacoes.endsWith('\u200B'), 'cirurgia text must end with invisible bot signature');
    assert.ok(cirurgiaResult.textoRecomendacoes.includes('USO DA CINTA FACIAL'));
    assert.ok(cirurgiaResult.textoRecomendacoes.includes('DRENAGENS LINFÁTICAS'));
    assert.ok(cirurgiaResult.textoRecomendacoes.includes('COMPRESSA GELADA'));
    assert.ok(cirurgiaResult.textoRecomendacoes.includes('POSIÇÃO PARA DORMIR'));

    // Test O Que Trazer Endolaser Pro payload
    const storeTrazer = { 'POST Enviar Pos-Preenchimento': { item: { json: { body: { remoteJid: '22955554444', nome: 'Fernanda Souza', tipo: 'o_que_trazer_endolaser' } } } } };
    const trazerResult = new Function('$json', '$', prepNode.parameters.jsCode)({}, (n) => storeTrazer[n]).json;

    assert.equal(trazerResult.remoteJid, '5522955554444@s.whatsapp.net');
    assert.equal(trazerResult.nome, 'Fernanda');
    assert.equal(trazerResult.tipo, 'o_que_trazer_endolaser');
    assert.ok(trazerResult.mediaUrl.includes('o_que_trazer_endolaser.jpg'));
    assert.ok(trazerResult.caption.endsWith('\u200B'), 'trazer caption must end with invisible bot signature');
    assert.ok(trazerResult.textoRecomendacoes.endsWith('\u200B'), 'trazer text must end with invisible bot signature');
    assert.ok(trazerResult.textoRecomendacoes.includes('TOALHA DE BANHO'));
    assert.ok(trazerResult.textoRecomendacoes.includes('2 GATORADES'));
    assert.ok(trazerResult.textoRecomendacoes.includes('BISCOITINHO DE SAL'));
    assert.ok(trazerResult.textoRecomendacoes.includes('ABSORVENTE GERIÁTRICO'));
    assert.ok(trazerResult.textoRecomendacoes.includes('CINTA'));
    assert.ok(trazerResult.textoRecomendacoes.includes('ROLO DE FITA CREPE'));
    assert.ok(trazerResult.textoRecomendacoes.includes('CALCINHA'));
    assert.ok(trazerResult.textoRecomendacoes.includes('VESTIDINHO FOLGADO'));
    assert.ok(trazerResult.textoRecomendacoes.includes('DICA EXTRA'));

    const panelPath = path.join(__dirname, '..', 'Painel_Amanda.html');
    const panelHtml = fs.readFileSync(panelPath, 'utf8');
    assert.ok(panelHtml.includes('enviarPosProcedimento'), 'must have enviarPosProcedimento');
    assert.ok(panelHtml.includes('Pós-Botox'), 'must have Pós-Botox button');
    assert.ok(panelHtml.includes('Pós-Endolaser'), 'must have Pós-Endolaser button');
    assert.ok(panelHtml.includes('Pós-Cirurgia'), 'must have Pós-Cirurgia button');
    assert.ok(panelHtml.includes('O Que Trazer'), 'must have O Que Trazer button');
});
