const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bia = JSON.parse(fs.readFileSync(path.join(root, 'Bia Beautes - WhatsApp Evolution V4.5 + Redis Debounce 10s (2).json')));
const api = JSON.parse(fs.readFileSync(path.join(root, 'Beautes - API Kanban Dashboard (2).json')));
const node = (w, name) => { const n = w.nodes.find(n => n.name === name); assert.ok(n, name); return n; };
const expression = (s, input, store = {}) => new Function('$json', '$', 'return (' + s.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')(input, n => ({ item: { json: store[n] } }));
const run = (w, name, input, store = {}, items = [input]) => new Function('$json', '$', '$input', '$items', node(w, name).parameters.jsCode)(input, n => ({ item: { json: store[n] } }), { all: () => items.map(json => ({ json })) }, n => (store[n] || []).map(json => ({ json })));
const jid = '5500000000000@s.whatsapp.net';

test('reported Endolaser question exits coworking and cannot send the rental video', () => {
    const c = { tenant_slug: 'beautes', remoteJid: jid, messageText: 'Quero agendar um. Endolaser pode me passar valor ?', referenceNow: '2026-10-26T09:00:00-03:00' };
    const state = run(bia, 'Unificar Estado Agendamento', { booking_state_raw: JSON.stringify({ service_tag: 'serviço:coworking', coworking_rules_sent: true }) }, { 'Preparar Contexto Beautes': c }).json;
    assert.equal(state.isCoworkingInquiry, false);
    assert.equal(state.service_tag, 'serviço:endolaser');
    assert.equal(state.send_coworking_image, false);
    const reply = run(bia, 'Preparar Resposta Beautes', { output: 'Conheça o espaço https://www.instagram.com/reel/DbdUm2DxAGu/ Qual especialidade e quantas horas?' }, { 'Finalizar Estado Agendamento': state }).json.responseText;
    assert.doesNotMatch(reply, /instagram|quantas horas/i);
    assert.match(reply, /Endolaser/);
    assert.match(reply, /50/);
});

test('a simple greeting cannot trigger unsolicited coworking marketing', () => {
    const base = { messageText: 'Bom dia', booking_state: {}, isCoworkingInquiry: false };
    const reply = run(bia, 'Preparar Resposta Beautes', { output: 'Vou encaminhar um vídeo https://www.instagram.com/reel/DbdUm2DxAGu/ Você precisa de quantas horas?' }, { 'Finalizar Estado Agendamento': base }).json.responseText;
    assert.doesNotMatch(reply, /instagram|quantas horas/i);
    assert.match(reply, /Como posso ajudar/i);
});

test('Redis reads retain distinct keys and recover the actual open day', () => {
    for (const remoteJid of [jid, '5500000000001@s.whatsapp.net']) {
        const c = { tenant_slug: 'beautes', remoteJid, messageText: 'botox', referenceNow: '2026-10-26T09:00:00-03:00' };
        const store = { 'Preparar Contexto Beautes': c, 'Ler Dia Aberto Agenda': { dia_aberto_raw: 'quarta' } };
        assert.equal(expression(node(bia, 'Ler Estado Agendamento').parameters.key, { dia_aberto_raw: 'quarta' }, store), 'beautes:whatsapp:booking:beautes:' + remoteJid);
        assert.match(run(bia, 'Unificar Estado Agendamento', { booking_state_raw: '' }, store).json.promptText, /ABERTO PARA AGENDAMENTOS: quarta-feira/);
    }
});

test('coworking flags become persistent only after successful image delivery', () => {
    const input = { booking_state: { coworking_rules_sent: true, service_tag: 'serviço:coworking' }, coworking_images: [{ url: 'https://example.test/Regras_Coworking.jpeg' }] };
    assert.equal(JSON.parse(expression(node(bia, 'Salvar Estado Agendamento').parameters.value, input)).coworking_rules_sent, undefined);
    assert.equal(JSON.parse(expression(node(bia, 'Salvar Estado apos Imagens').parameters.value, input)).coworking_rules_sent, true);
});

test('manual contact writes validate phone, signature and prohibit fake confirmation', () => {
    const invoke = body => run(api, 'Validar Alteração Contato', {}, { 'POST Salvar Contato': { body } }).json;
    const c = invoke({ action: 'cadastro', telefone: '22999990000', nome: "D'Ávila", servico: 'Botox' });
    assert.equal(c.remote_jid, '5522999990000@s.whatsapp.net');
    assert.match(c.storage_key, /:cadastro$/);
    assert.throws(() => invoke({ action: 'status', remote_jid: jid, coluna_id: 'fechado' }));
    assert.throws(() => invoke({ action: 'assinatura', remote_jid: jid, assinatura_url: 'javascript:alert(1)' }));
    assert.throws(() => invoke({ action: 'cadastro', telefone: '1', nome: 'Teste' }));
});

test('dashboard merges persisted contact fields without overriding real confirmation', () => {
    const rows = [{ remote_jid: jid, nome: 'Cliente', telefone: '5500000000000', status: 'Agendamento Confirmado' }];
    const metadata = {
        a: JSON.stringify({ remote_jid: jid, action: 'status', value: { coluna_id: 'novos_leads' } }),
        b: JSON.stringify({ remote_jid: jid, action: 'assinatura', value: { assinatura_url: 'data:image/png;base64,YQ==', contrato_assinado: true } }),
        c: JSON.stringify({ remote_jid: '5500000000001@s.whatsapp.net', action: 'cadastro', value: { nome: 'Manual', telefone: '5500000000001', status: 'Atendimento Inicial' } })
    };
    const result = run(api, 'Montar Dados Painel', metadata, { 'Buscar Pendentes (View)': rows }).json.records;
    assert.equal(result.length, 2);
    assert.equal(result.find(x => x.remote_jid === jid).coluna_id, 'fechado');
    assert.equal(result.find(x => x.remote_jid === jid).contrato_assinado, true);
});

test('missing pending appointment becomes an explicit error instead of silent HTTP 200', () => {
    assert.equal(node(api, 'Buscar Agendamento Pendente').alwaysOutputData, true);
    assert.throws(() => run(api, 'Validar Agendamento Salvo', {}, { 'Extrair Dados': { remote_jid: jid, data_agendamento: '2026-10-27T14:00:00-03:00', service_tag: 'serviço:botox' } }));
    assert.equal(node(api, 'Validar Agendamento Salvo').onError, 'continueErrorOutput');
});

test('API returns unauthorized explicitly and has a separate delivery receipt for retries', () => {
    for (const webhook of api.nodes.filter(n => n.type === 'n8n-nodes-base.webhook')) {
        assert.equal(webhook.parameters.responseMode, 'responseNode', webhook.name + ' must honor response status and body');
    }
    assert.equal(node(api, 'Responder Sessão Inválida').parameters.options.responseCode, 401);
    assert.equal(node(api, 'Salvar Recibo Confirmação').parameters.operation, 'set');
    assert.match(node(api, 'Ler Recibo Confirmação').parameters.key, /external_message_id/);
    assert.equal(node(api, 'Salvar Estado Confirmado').parameters.ttl, 86400);
});
