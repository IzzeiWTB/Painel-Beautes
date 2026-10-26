// Auditoria local: não faz chamadas de rede, não envia mensagens e não altera workflows.
// Exit 1 significa requisito não atendido; não substitui a suíte existente.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const bia = JSON.parse(read('Bia Beautes - WhatsApp Evolution V4.5 + Redis Debounce 10s (2).json'));
const api = JSON.parse(read('Beautes - API Kanban Dashboard (2).json'));
const node = (workflow, name) => workflow.nodes.find(n => n.name === name);
const run = (name, input, store = {}) => new Function('$json', '$', node(bia, name).parameters.jsCode)(input, name => ({ item: { json: store[name] }, first: () => ({ json: store[name] }) })).json;
const expr = (expression, input, store = {}) => new Function('$json', '$', 'return (' + expression.replace(/^=\{\{\s*|\s*\}\}$/g, '') + ')')(input, name => ({ item: { json: store[name] } }));
const results = [];
function check(id, requirement, expected, actual) {
    results.push({ id, requirement, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) });
}

const initial = { messageText: 'Quero botox', contactName: 'Auditoria', phone: '5500000000000', remoteJid: '5500000000000@s.whatsapp.net', tenant_slug: 'beautes', referenceNow: '2026-10-26T09:00:00-03:00' };
const context = run('Preparar Contexto Beautes', initial);
// Formato efetivamente observado na execução n8n 7374: GET Redis retorna apenas sua propriedade.
const dayOutput = { dia_aberto_raw: 'terca' };
const key = expr(node(bia, 'Ler Estado Agendamento').parameters.key, dayOutput, { 'Preparar Contexto Beautes': context });
check('F01', 'Chave Redis de leitura mantém tenant e conversa após ler o dia aberto', 'beautes:whatsapp:booking:beautes:' + initial.remoteJid, key);
const merged = run('Unificar Estado Agendamento', { booking_state_raw: null }, { 'Preparar Contexto Beautes': context, 'Ler Dia Aberto Agenda': dayOutput });
check('F02', 'Dia aberto terça chega ao prompt após duas leituras Redis', true, merged.promptText.includes('DIA DA SEMANA ABERTO PARA AGENDAMENTOS: terça-feira'));

const storedEvent = { tenant_slug: 'beautes', external_conversation_id: initial.remoteJid, external_message_id: 'audit-reply', service: 'serviço:botox', data_agendamento: '2026-10-27T14:00:00-03:00', stage: 'Validacao de Pagamento/Agendamento' };
const eventContext = { ...context, service_tag: storedEvent.service, data_agendamento: storedEvent.data_agendamento, booking_state: { customer_confirmed: true } };
const eventStore = { 'Preparar Evento Enviado': eventContext };
const customerCondition = node(bia, 'Cliente confirmou serviço e horário?').parameters.conditions.conditions[0].leftValue;
let condition;
try { condition = expr(customerCondition, storedEvent, eventStore); } catch (error) { condition = error.name; }
check('F03', 'IF de alerta consegue reconhecer confirmação na linha retornada pelo banco', true, condition ?? 'undefined');
let alertError = null;
try { run('Preparar Alerta para Atendente', { ['beautes:appointment-request-alert:' + initial.remoteJid + ':serviço:botox:' + storedEvent.data_agendamento]: 1 }, eventStore); } catch (error) { alertError = error.name + ': ' + error.message; }
check('F04', 'Preparar alerta aceita a saída real do INCR Redis', null, alertError);
const alert = run('Preparar Alerta para Atendente', { ...storedEvent, remoteJid: initial.remoteJid, service_tag: 'serviço:botox', alert_count: 1 });
check('F05', 'Aviso à atendente termina com assinatura invisível', true, alert.alert_message.endsWith('\u200B'));

function turn(message, state = '') {
    const c = run('Preparar Contexto Beautes', { ...initial, messageText: message });
    let value = run('Unificar Estado Agendamento', { booking_state_raw: state }, { 'Preparar Contexto Beautes': c });
    for (const name of ['Sanitizar Contexto Serviço', 'Resolver Hoje ou Próxima Semana', 'Reconciliar Estado Confirmado', 'Finalizar Estado Agendamento']) value = run(name, value);
    return value;
}
for (const [id, message, expected] of [
    ['F06', 'Quero botox dia 27/10/2026 às 19h', ''],
    ['F07', 'Quero botox dia 27/10/2026 14:30', '2026-10-27T14:30:00-03:00'],
    ['F08', 'Quero botox dia 27/10/2026 às 8 da noite', '']
]) check(id, message, expected, turn(message).booking_state.scheduled_at);

const confirmedState = { service_tag: 'serviço:botox', service_label: 'Botox', scheduled_at: storedEvent.data_agendamento, customer_confirmed: true, system_confirmed: true };
const answer = run('Preparar Resposta Beautes', { output: 'O valor é informado conforme a avaliação.' }, { 'Finalizar Estado Agendamento': { booking_state: confirmedState, data_agendamento: storedEvent.data_agendamento } });
check('F09', 'Pergunta após confirmação preserva a resposta da IA', 'O valor é informado conforme a avaliação.\u200B', answer.responseText);
check('F10', 'TTL da confirmação manual é de 24 horas', 86400, node(api, 'Salvar Estado Confirmado').parameters.ttl);
check('F11', 'Debounce corresponde aos 10 segundos documentados', 10, node(bia, 'Aguardar 10s').parameters.amount);

const html = read('Painel_Amanda.html');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const sandbox = { window: { supabase: { createClient: () => ({}) } }, Intl, Date, console };
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const card = sandbox.gerarHTMLCard({ nome: "Cliente');globalThis.auditInjected=true;//", remote_jid: initial.remoteJid, telefone: initial.phone, service_tag: 'serviço:botox', coluna_id: 'novos_leads' });
const handler = [...card.matchAll(/onclick="([^"]+)"/g)].map(m => m[1]).find(s => s.includes('enviarPosProcedimento'));
// O parser HTML decodifica entidades antes de compilar atributos onclick.
const decode = value => value.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const clickSandbox = { enviarPosProcedimento() {}, auditInjected: false };
if (handler) vm.runInNewContext(decode(handler), clickSandbox);
else {
    const dataName = card.match(/data-nome="([^"]*)"/);
    let clickHandler, receivedName;
    sandbox.document = { addEventListener: (event, callback) => { clickHandler = callback; } };
    sandbox.enviarPosProcedimento = (jid, name) => { receivedName = name; };
    sandbox.registrarAcoesPainel();
    const button = { disabled: false, dataset: { action: 'pos', jid: initial.remoteJid, nome: decode(dataName?.[1] || ''), tipo: 'botox' } };
    clickHandler({ target: { closest: () => button } });
    if (receivedName !== "Cliente');globalThis.auditInjected=true;//") throw new Error('Contato não preservado pelo handler seguro');
}
check('F12', 'Nome do contato é tratado como dado, sem executar JavaScript no clique', false, clickSandbox.auditInjected);

const badge = { innerHTML: '' };
sandbox.document = { getElementById: id => id === 'badgeVagasDia' ? badge : { value: 'segunda' } };
vm.runInContext("clientesGlobais = [{ coluna_id: 'fechado', data_agendamento: '2025-10-20T12:00:00-03:00' }]; atualizarResumoVagas();", sandbox);
check('F13', 'Agenda não conta confirmação de uma segunda-feira de outro ano como ocupação atual', true, badge.innerHTML.startsWith('<strong>0</strong>'));

console.log(JSON.stringify({ checks: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results }, null, 2));
process.exitCode = results.some(r => !r.passed) ? 1 : 0;
