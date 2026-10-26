const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.TZ = 'UTC';

const workflowPath = path.join(__dirname, '..', 'Bia Beautes - WhatsApp Evolution V4.5 + Redis Debounce 10s (2).json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const byName = (name) => workflow.nodes.find((node) => node.name === name);
const code = (name) => {
    const node = byName(name);
    assert.ok(node, `node "${name}" must exist`);
    return node.parameters.jsCode;
};

function turn(message, rawState = '') {
    const input = { messageText: message, contactName: 'Teste', phone: '5522999999999', remoteJid: '5522999999999@s.whatsapp.net', referenceNow: '2026-10-13T12:00:00-03:00' };
    const context = new Function('$json', code('Preparar Contexto Beautes'))(input).json;
    const store = { 'Preparar Contexto Beautes': context };
    const dollar = (name) => ({ item: { json: store[name] }, first: () => ({ json: store[name] }) });
    let current = new Function('$json', '$', code('Unificar Estado Agendamento'))({ ...context, booking_state_raw: rawState }, dollar).json;
    for (const name of ['Sanitizar Contexto Serviço', 'Resolver Hoje ou Próxima Semana', 'Reconciliar Estado Confirmado', 'Finalizar Estado Agendamento']) {
        current = new Function('$json', '$', code(name))(current, dollar).json;
    }
    store['Finalizar Estado Agendamento'] = current;
    const response = new Function('$json', '$', code('Preparar Resposta Beautes'))({ output: 'ok' }, dollar).json;
    store['Preparar Resposta Beautes'] = response;
    let images = [];
    let restored = response;
    if (response.send_coworking_image === true) {
        images = new Function('$json', code('Montar Imagens Coworking'))(response).map((item) => item.json);
        restored = new Function('$', code('Restaurar Contexto apos Imagem'))(dollar)[0].json;
    }
    return { response, images, restored, state: JSON.stringify(response.booking_state) };
}

const file = (image) => decodeURIComponent(image.coworking_image_url.split('/').pop());

test('workflow graph has unique node names and no dangling connections', () => {
    const names = workflow.nodes.map((node) => node.name);
    assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), []);
    const known = new Set(names);
    for (const [source, outputs] of Object.entries(workflow.connections)) {
        assert.ok(known.has(source), `connection source "${source}" must exist`);
        for (const branch of outputs.main || []) for (const target of branch) assert.ok(known.has(target.node), `target "${target.node}" (from "${source}") must exist`);
    }
});

test('every code node compiles', () => {
    for (const node of workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.code')) {
        assert.doesNotThrow(() => new Function('$json', '$', '$input', '$env', '$items', node.parameters.jsCode), `${node.name} must compile`);
    }
});

test('"Vcs alugam sala?" is a coworking inquiry and sends only the rules first', () => {
    const result = turn('Oi bom-dia. Vcs alugam sala ?');
    assert.equal(result.response.isCoworkingInquiry, true);
    assert.equal(typeof result.response.send_coworking_image, 'boolean');
    assert.deepEqual(result.images.map(file), ['Regras_Coworking.jpeg']);
    assert.ok(result.restored.responseText && result.restored.remoteJid, 'text node must still receive the full context after the image branch');
});

test('specialty picks the right table and nothing is sent twice', () => {
    const first = turn('Vcs alugam sala?');
    const dentist = turn('Sou dentista, preciso de 5 horas', first.state);
    assert.equal(dentist.response.service_tag, 'serviço:coworking-odontologico');
    assert.deepEqual(dentist.images.map(file), ['imagem beautes.jpeg']);
    const followUp = turn('e quanto fica o mensal?', dentist.state);
    assert.equal(followUp.response.service_tag, 'serviço:coworking-odontologico');
    assert.equal(followUp.response.send_coworking_image, false);
    assert.deepEqual(followUp.images, []);
    const aesthetician = turn('Sou esteticista, preciso de uma sala', first.state);
    assert.equal(aesthetician.response.service_tag, 'serviço:coworking-procedimentos');
    assert.deepEqual(aesthetician.images.map(file), ['Beautes_coworking_corrigido.jpeg']);
});

test('specialty on the first message sends the table and then the rules', () => {
    const result = turn('Queria alugar consultório para dentista');
    assert.deepEqual(result.images.map(file), ['imagem beautes.jpeg', 'Regras_Coworking.jpeg']);
    assert.match(result.response.promptText, /não pergunte de novo/);
});

test('every coworking image caption carries the invisible bot signature', () => {
    const result = turn('Queria alugar consultório para dentista');
    assert.ok(result.images.length > 0);
    for (const image of result.images) assert.ok(image.coworking_image_caption.endsWith('\u200B'), 'a caption without \\u200B would pause the bot as if a human had replied');
});

test('the image branch hands the full context back to the text node', () => {
    const image = byName('Enviar Imagem Beautes');
    assert.equal(image.parameters.remoteJid, '={{ $json.remoteJid }}');
    assert.equal(image.parameters.image, '={{ $json.coworking_image_url }}');
    assert.deepEqual(workflow.connections['Detectar Sublocação para Imagem'].main[1].map((t) => t.node), ['Enviar Resposta pela Evolution']);
    assert.deepEqual(workflow.connections['Enviar Imagem Beautes'].main[0].map((t) => t.node), ['Restaurar Contexto apos Imagem']);
    assert.deepEqual(workflow.connections['Restaurar Contexto apos Imagem'].main[0].map((t) => t.node), ['Salvar Estado apos Imagens']);
    assert.deepEqual(workflow.connections['Salvar Estado apos Imagens'].main[0].map((t) => t.node), ['Enviar Resposta pela Evolution']);
    assert.ok(!(workflow.connections['Salvar Evento Enviado'].main[0] || []).some((t) => t.node === 'Detectar Sublocação para Imagem'), 'no loop back into the image branch');
});

test('asking for another service leaves the coworking flow', () => {
    const first = turn('Vcs alugam sala?');
    assert.equal(turn('Quero fazer botox', first.state).response.service_tag, 'serviço:botox');
    assert.equal(turn('Sou dentista e faço implante', first.state).response.service_tag, 'serviço:coworking-odontologico');
});

test('dental patients and ordinary messages are not coworking leads', () => {
    assert.equal(turn('Vocês fazem clareamento? Quero marcar na odontologia').response.service_tag, 'serviço:clareamento');
    assert.equal(turn('Quero fazer implante dentário').response.service_tag, 'serviço:implante');
    for (const text of ['Vocês ficam no Medical Center?', 'Qual o endereço da clínica? Fica no local de sempre?', 'Bom dia']) {
        const result = turn(text);
        assert.equal(result.response.isCoworkingInquiry, false, text);
        assert.deepEqual(result.images, [], text);
    }
    assert.notEqual(turn('Bom dia').response.stage, 'Agendamento');
});

test('a coworking request is never auto-confirmed as an appointment', () => {
    const result = turn('quero alugar a sala sexta às 14h');
    assert.equal(result.response.data_agendamento, undefined);
});

test('a human reply pauses the bot and the pause is actually enforced', () => {
    const normalize = new Function('$json', '$env', code('Normalizar Entrada WhatsApp'));
    const human = normalize({ body: { event: 'messages.upsert', data: { key: { remoteJid: '5522999999999@s.whatsapp.net', fromMe: true, id: 'H1' }, message: { conversation: 'Oi, aqui é a atendente' } } } }, {}).json;
    assert.equal(human.isHuman, true);
    const bot = normalize({ body: { event: 'messages.upsert', data: { key: { remoteJid: '5522999999999@s.whatsapp.net', fromMe: true, id: 'B1' }, message: { imageMessage: { caption: 'Tabela 👇\u200B' } } } } }, {}).json;
    assert.equal(bot.isHuman, false);
    assert.equal(bot.shouldProcess, false);

    const rule = byName('Mensagem valida?').parameters.conditions.conditions.find((item) => String(item.leftValue).includes('bot_paused'));
    assert.ok(rule, '"Mensagem valida?" must evaluate bot_paused in the v2.2 conditions array');
    assert.equal(byName('Mensagem valida?').parameters.conditions.string, undefined, 'legacy block is ignored by IF v2.2');
    const evaluate = (json) => new Function('$json', 'return ' + rule.leftValue.slice(3, -2))(json);
    assert.equal(evaluate({ bot_paused: 'true' }), false);
    assert.equal(evaluate({ bot_paused: null }), true);
    assert.equal(evaluate({}), true);
});

test('WhatsApp Business automatic greeting is not treated as a human reply', () => {
    const normalize = new Function('$json', '$env', code('Normalizar Entrada WhatsApp'));
    const autoReply = normalize({ body: { event: 'messages.upsert', data: { key: { remoteJid: '5521967095989@s.whatsapp.net', fromMe: true, id: 'A1' }, message: { conversation: 'Recebi sua mensagem. Um especialista continuara o atendimento.' } } } }, {}).json;
    assert.equal(autoReply.isHuman, false);
    assert.equal(autoReply.shouldProcess, false);
    assert.equal(autoReply.ignoredReason, 'auto_reply_event');
});


test('Restaurar Contexto apos Pausa restores full context and sets bot_paused correctly', () => {
    const original = { shouldProcess: true, remoteJid: '5521999999999@s.whatsapp.net', messageText: 'Oi', tenant_slug: 'beautes', messageId: 'M1' };
    const dollar = (name) => ({ item: { json: original } });
    const run = (redisOutput) => new Function('$json', '$', code('Restaurar Contexto apos Pausa'))(redisOutput, dollar).json;

    const notPaused = run({ bot_paused: null });
    assert.equal(notPaused.shouldProcess, true);
    assert.equal(notPaused.remoteJid, original.remoteJid);
    assert.equal(notPaused.bot_paused, '');

    const paused = run({ bot_paused: 'true' });
    assert.equal(paused.shouldProcess, true);
    assert.equal(paused.bot_paused, 'true');
});
