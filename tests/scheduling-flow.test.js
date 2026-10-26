const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.TZ = 'UTC';

const workflowPath = path.join(__dirname, '..', 'Bia Beautes - WhatsApp Evolution V4.5 + Redis Debounce 10s (2).json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const stateNode = workflow.nodes.find((node) => node.name === 'Unificar Estado Agendamento');
const contextNode = workflow.nodes.find((node) => node.name === 'Sanitizar Contexto Serviço');
const weekdayNode = workflow.nodes.find((node) => node.name === 'Resolver Hoje ou Próxima Semana');
const reconcileNode = workflow.nodes.find((node) => node.name === 'Reconciliar Estado Confirmado');
const finalizeNode = workflow.nodes.find((node) => node.name === 'Finalizar Estado Agendamento');
const apiPath = path.join(__dirname, '..', 'Beautes - API Kanban Dashboard (2).json');
const apiWorkflow = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
const panelPath = path.join(__dirname, '..', 'Painel_Amanda.html');
const panelHtml = fs.readFileSync(panelPath, 'utf8');
const dateHelpersStart = panelHtml.indexOf('function converterDataSegura');
const dateHelpersEnd = panelHtml.indexOf('function extrairTextoCliente', dateHelpersStart);
const dateHelpers = new Function(panelHtml.slice(dateHelpersStart, dateHelpersEnd) + '; return { formatarDataHoraString };')();

function runState(input) {
    assert.ok(stateNode, 'workflow must have the structured appointment-state node');
    assert.ok(contextNode, 'workflow must remove stale service classifications from the prompt');
    assert.ok(weekdayNode, 'workflow must preserve a future time requested for today');
    assert.ok(reconcileNode, 'workflow must reconcile the API confirmation marker');
    assert.ok(finalizeNode, 'workflow must finalize appointment state before saving it');
    const parsed = new Function('$json', stateNode.parameters.jsCode)(input).json;
    const sanitized = new Function('$json', contextNode.parameters.jsCode)(parsed).json;
    const corrected = new Function('$json', weekdayNode.parameters.jsCode)(sanitized).json;
    const reconciled = new Function('$json', reconcileNode.parameters.jsCode)(corrected).json;
    return new Function('$json', finalizeNode.parameters.jsCode)(reconciled).json;
}

test('service and date/time persist across separate customer messages', () => {
    const previousState = {
        service_tag: 'serviço:botox',
        service_label: 'Toxina Botulínica (Botox)',
    };
    const output = runState({
        messageText: 'sexta-feira às 14h',
        booking_state_raw: JSON.stringify(previousState),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.service_tag, 'serviço:botox');
    assert.equal(output.booking_state.scheduled_at, '2026-10-09T14:00:00-03:00');
    assert.equal(output.booking_state.awaiting_customer_confirmation, true);
    assert.equal(output.data_agendamento, undefined);
});

test('an explicit service produces the exact persistent tag', () => {
    const output = runState({
        messageText: 'Quero endolaser',
        booking_state_raw: '',
        promptText: 'Procedimento identificado: Acompanhamento Pós-operatório',
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.service, 'serviço:endolaser');
    assert.equal(output.procedimento, 'Endolaser');
    assert.doesNotMatch(output.promptText, /Procedimento identificado: Acompanhamento/);
    assert.match(output.promptText, /Serviço exato: Endolaser/);
});

test('a client confirmation persists the exact requested appointment', () => {
    const state = {
        service_tag: 'serviço:endolaser',
        service_label: 'Endolaser',
        scheduled_at: '2026-10-09T14:00:00-03:00',
        awaiting_customer_confirmation: true,
        customer_confirmed: false,
    };
    const output = runState({
        messageText: 'Sim, confirmo esse horário',
        booking_state_raw: JSON.stringify(state),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.service, 'serviço:endolaser');
    assert.equal(output.data_agendamento, '2026-10-09T14:00:00-03:00');
    assert.equal(output.booking_state.customer_confirmed, true);
});

test('a changed time requires a new customer confirmation', () => {
    const state = {
        service_tag: 'serviço:botox',
        service_label: 'Toxina Botulínica (Botox)',
        appointment_date: '2026-10-09',
        scheduled_at: '2026-10-09T14:00:00-03:00',
        awaiting_customer_confirmation: true,
        customer_confirmed: false,
    };
    const output = runState({
        messageText: 'Prefiro às 15h',
        booking_state_raw: JSON.stringify(state),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.booking_state.scheduled_at, '2026-10-09T15:00:00-03:00');
    assert.equal(output.booking_state.awaiting_customer_confirmation, true);
    assert.equal(output.booking_state.customer_confirmed, false);
    assert.equal(output.data_agendamento, undefined);
});

test('a follow-up message keeps an already confirmed appointment confirmed', () => {
    const state = {
        service_tag: 'serviço:endolaser',
        service_label: 'Endolaser',
        appointment_date: '2026-10-09',
        appointment_time: '14:00',
        scheduled_at: '2026-10-09T14:00:00-03:00',
        awaiting_customer_confirmation: false,
        customer_confirmed: true,
        system_confirmed: true,
    };
    const output = runState({
        messageText: 'Onde fica a clínica?',
        booking_state_raw: JSON.stringify(state),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.stage, 'Agendamento Confirmado');
    assert.equal(output.data_agendamento, state.scheduled_at);
    assert.equal(output.booking_state.system_confirmed, true);
});

test('a past day/month without a year is rejected instead of moved to next year', () => {
    const output = runState({
        messageText: '5/10 às 14h',
        booking_state_raw: JSON.stringify({ service_tag: 'serviço:botox', service_label: 'Toxina Botulínica (Botox)' }),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.data_agendamento, undefined);
    assert.equal(output.booking_state.scheduled_at, '');
    assert.equal(output.booking_state.schedule_error, 'year_missing');
});

test('an explicit ISO year is never mistaken for an omitted year', () => {
    const output = runState({
        messageText: 'Quero endolaser em 2027-01-05 às 14h',
        booking_state_raw: '',
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.booking_state.scheduled_at, '2027-01-05T14:00:00-03:00');
    assert.equal(output.booking_state.schedule_error, '');
    assert.equal(output.data_agendamento, undefined);
});

test('the current weekday stays on today when the requested time is still ahead', () => {
    const output = runState({
        messageText: 'sexta-feira às 14h',
        booking_state_raw: JSON.stringify({ service_tag: 'serviço:endolaser', service_label: 'Endolaser' }),
        referenceNow: '2026-10-09T10:00:00-03:00',
    });

    assert.equal(output.booking_state.scheduled_at, '2026-10-09T14:00:00-03:00');
});

test('an unrecognized or ambiguous service is never saved as estetica', () => {
    const output = runState({
        messageText: 'quero botox ou endolaser',
        booking_state_raw: '',
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.service, '');
    assert.equal(output.service_tag, '');
    assert.notEqual(output.service, 'estetica');
});

test('the confirmation update targets one exact outbound event', () => {
    const update = apiWorkflow.nodes.find((node) => node.name === 'Atualizar Banco');

    assert.equal(update.parameters.filterType, 'manual');
    assert.ok(update.parameters.filters.conditions.some((condition) => condition.keyName === 'external_message_id'));
});

test('confirmation requests without an offset are interpreted as Sao Paulo wall time', () => {
    const extract = apiWorkflow.nodes.find((node) => node.name === 'Extrair Dados');
    const run = new Function('$json', '$', extract.parameters.jsCode);
    const output = run({}, () => ({ item: { json: { body: {
        remote_jid: '5522996186798@s.whatsapp.net',
        data_agendamento: '2026-10-09T14:00:00',
        service_tag: 'serviço:endolaser',
    } } } })).json;

    assert.equal(output.data_agendamento, '2026-10-09T14:00:00-03:00');
});

test('both dashboard webhooks validate the Supabase access token', () => {
    const names = apiWorkflow.nodes.map((node) => node.name);

    assert.ok(names.includes('Validar Sessão GET'));
    assert.ok(names.includes('Validar Sessão POST'));
    assert.equal(apiWorkflow.connections['GET Carregar Painel'].main[0][0].node, 'Validar Sessão GET');
    assert.equal(apiWorkflow.connections['POST Confirmar Cliente'].main[0][0].node, 'Validar Sessão POST');
});

test('the owner alert uses an atomic Redis claim keyed by the confirmed event', () => {
    const claim = workflow.nodes.find((node) => node.name === 'Reivindicar Alerta de Solicitação');
    const alert = workflow.nodes.find((node) => node.name === 'Avisar Atendente Agendamento');
    const confirmedGate = workflow.nodes.find((node) => node.name === 'Cliente confirmou serviço e horário?');

    assert.equal(claim.parameters.operation, 'incr');
    assert.match(claim.parameters.key, /appointment-request-alert/);
    assert.ok(alert);
    assert.match(alert.parameters.remoteJid, /5522996186798/);
    const expression = confirmedGate.parameters.conditions.conditions[0].leftValue.replace(/^=\{\{\s*|\s*\}\}$/g, '');
    const evaluate = new Function('$json', '$', 'return (' + expression + ')');
    assert.equal(evaluate({ external_message_id: 'saved-row' }, () => ({ item: { json: { booking_state: { customer_confirmed: true } } } })), true);
    assert.equal(evaluate({}, () => ({ item: { json: { booking_state: { customer_confirmed: true, system_confirmed: true } } } })), false);
    assert.equal(workflow.connections['Salvar Evento Enviado'].main[0][0].node, 'Cliente confirmou serviço e horário?');
    assert.equal(apiWorkflow.nodes.some((node) => node.name === 'Avisar Responsável Agendamento'), false);
});

test('the owner alert formats a pending request from the saved instant in Sao Paulo time', () => {
    const node = workflow.nodes.find((item) => item.name === 'Preparar Alerta para Atendente');
    const run = new Function('$json', node.parameters.jsCode);
    const output = run({
        remoteJid: '5522996186798@s.whatsapp.net',
        service_tag: 'serviço:endolaser',
        data_agendamento: '2026-10-09T17:00:00.000Z',
        alert_count: 1,
    }).json;

    assert.equal(output.alert_message, 'Pedido de agendamento: serviço endolaser para sexta-feira (09/10) às 14h. Confira no painel e confirme quando estiver validado.\u200B');
});

test('the owner alert treats a timezone-less pending request as Sao Paulo time', () => {
    const node = workflow.nodes.find((item) => item.name === 'Preparar Alerta para Atendente');
    const run = new Function('$json', node.parameters.jsCode);
    const output = run({
        remoteJid: '5522996186798@s.whatsapp.net',
        service_tag: 'serviço:endolaser',
        data_agendamento: '2026-10-09T14:00:00',
        alert_count: 1,
    }).json;

    assert.equal(output.alert_message, 'Pedido de agendamento: serviço endolaser para sexta-feira (09/10) às 14h. Confira no painel e confirme quando estiver validado.\u200B');
});

test('the panel formats appointment times in Sao Paulo time', () => {
    assert.match(panelHtml, /timeZone:\s*['"]America\/Sao_Paulo['"]/);
    assert.equal(dateHelpers.formatarDataHoraString('2026-10-09T17:00:00.000Z'), '09/10/2026 às 14:00');
    assert.equal(dateHelpers.formatarDataHoraString('2026-10-09T14:00:00'), '09/10/2026 às 14:00');
});

test('the panel confirms the saved appointment without allowing a silent time change', () => {
    assert.match(panelHtml, /dataEscolhida[^>]*readonly/i);
    assert.match(panelHtml, /service_tag/);
    assert.match(panelHtml, /data_agendamento:\s*cliente\.data_agendamento/);
});

test('the panel routes Agendamento into the agenda instead of new leads', () => {
    assert.match(panelHtml, /rawStatus\.includes\('agendamento'\)/);
});

test('the panel refreshes the Supabase access token used by protected webhooks', () => {
    assert.match(panelHtml, /autoRefreshToken:\s*true/);
    assert.match(panelHtml, /event === 'TOKEN_REFRESHED'/);
});

test('state expires after 24h of inactivity and resets cleanly', () => {
    const expiredState = {
        service_tag: 'serviço:botox',
        service_label: 'Toxina Botulínica (Botox)',
        scheduled_at: '2026-10-09T14:00:00-03:00',
        customer_confirmed: true,
        updated_at: '2026-10-06T10:00:00-03:00',
    };
    const output = runState({
        messageText: 'Olá',
        booking_state_raw: JSON.stringify(expiredState),
        referenceNow: '2026-10-07T12:00:00-03:00', // 26h later
    });

    assert.equal(output.service_tag, '');
    assert.equal(output.data_agendamento, undefined);
    assert.equal(output.booking_state.scheduled_at, '');
});

test('a scheduled appointment in the past is automatically cleared', () => {
    const pastState = {
        service_tag: 'serviço:botox',
        service_label: 'Toxina Botulínica (Botox)',
        scheduled_at: '2026-10-05T14:00:00-03:00',
        customer_confirmed: true,
    };
    const output = runState({
        messageText: 'Oi',
        booking_state_raw: JSON.stringify(pastState),
        referenceNow: '2026-10-06T12:00:00-03:00',
    });

    assert.equal(output.booking_state.scheduled_at, '');
    assert.equal(output.booking_state.customer_confirmed, false);
    assert.equal(output.data_agendamento, undefined);
});

test('Salvar Estado Agendamento has a 24-hour (86400s) TTL in Redis', () => {
    const node = workflow.nodes.find((item) => item.name === 'Salvar Estado Agendamento');
    assert.ok(node);
    assert.equal(node.parameters.ttl, 86400, 'session state in Redis must expire after 24 hours to match chat memory and human pause');
});

test('Preenchimento Labial and Preenchimento Facial (Full Face) are distinct services', () => {
    const labial = runState({ messageText: 'Quero preenchimento labial', booking_state_raw: '', referenceNow: '2026-10-06T12:00:00-03:00' });
    assert.equal(labial.service_tag, 'serviço:preenchimento-labial');
    assert.equal(labial.procedimento, 'Preenchimento Labial');

    const facial = runState({ messageText: 'Quero preenchimento facial', booking_state_raw: '', referenceNow: '2026-10-06T12:00:00-03:00' });
    assert.equal(facial.service_tag, 'serviço:preenchimento-facial-full-face');
    assert.equal(facial.procedimento, 'Preenchimento Facial (Full Face)');

    const fullFace = runState({ messageText: 'Queria fazer full face', booking_state_raw: '', referenceNow: '2026-10-06T12:00:00-03:00' });
    assert.equal(fullFace.service_tag, 'serviço:preenchimento-facial-full-face');
    assert.equal(fullFace.procedimento, 'Preenchimento Facial (Full Face)');

    const generic = runState({ messageText: 'Qual valor do preenchimento?', booking_state_raw: '', referenceNow: '2026-10-06T12:00:00-03:00' });
    assert.equal(generic.service_needs_clarification, true);
    assert.deepEqual(generic.booking_state.service_options, ['Preenchimento Labial', 'Preenchimento Facial (Full Face)']);
});

test('Preparar Resposta Beautes preserves raw AI response text instead of forcing repetitive template', () => {
    const prepNode = workflow.nodes.find((item) => item.name === 'Preparar Resposta Beautes');
    assert.ok(prepNode);
    const mockState = {
        booking_state: {
            service_tag: 'serviço:preenchimento-labial',
            service_label: 'Preenchimento Labial',
            scheduled_at: '2026-10-26T14:00:00-03:00',
            awaiting_customer_confirmation: true,
            customer_confirmed: false
        }
    };
    const dollar = (name) => ({ item: { json: mockState } });
    const aiResponse = 'O valor do preenchimento labial só é passado em consulta avaliativa...';
    const output = new Function('$json', '$', prepNode.parameters.jsCode)({ output: aiResponse }, dollar).json;
    assert.ok(output.responseText.startsWith(aiResponse), 'must keep AI response text when customer asks questions');
});

test('Customer pre-booking confirmation explicitly mentions attendant validation and triggers handoff', () => {
    const prepNode = workflow.nodes.find((item) => item.name === 'Preparar Resposta Beautes');
    assert.ok(prepNode);
    const mockConfirmed = {
        service_label: 'Endolaser',
        service_tag: 'serviço:endolaser',
        data_agendamento: '2026-10-26T15:00:00-03:00',
        booking_state: {
            service_label: 'Endolaser',
            service_tag: 'serviço:endolaser',
            scheduled_at: '2026-10-26T15:00:00-03:00',
            customer_confirmed: true
        }
    };
    const dollar = () => ({ item: { json: mockConfirmed } });
    const output = new Function('$json', '$', prepNode.parameters.jsCode)({}, dollar).json;
    assert.match(output.responseText, /atendente/i, 'must inform customer that an attendant will verify and confirm the schedule');
    assert.equal(output.handoff, true, 'must handoff to human attendant validation');
    assert.equal(output.stage, 'Validacao de Pagamento/Agendamento');

    const biaNode = workflow.nodes.find((item) => item.name === 'Assistente Bia (Gemini)');
    const systemPrompt = biaNode.parameters.options.systemMessage;
    assert.match(systemPrompt, /atendente.*confirmar.*agenda|atendente.*verificar/i, 'Bia prompt must instruct that an attendant will confirm on the agenda');
});

test('Unificar Estado Agendamento injects the active scheduling day from Redis into promptText', () => {
    const unificarNode = workflow.nodes.find((item) => item.name === 'Unificar Estado Agendamento');
    assert.ok(unificarNode);

    // Default: segunda-feira
    const outDefault = new Function('$json', unificarNode.parameters.jsCode)({ messageText: 'Olá', booking_state_raw: '' }).json;
    assert.match(outDefault.promptText, /DIA DA SEMANA ABERTO PARA AGENDAMENTOS: segunda-feira/i);

    // When changed to terca
    const outTerca = new Function('$json', unificarNode.parameters.jsCode)({ messageText: 'Olá', dia_aberto_raw: 'terca', booking_state_raw: '' }).json;
    assert.match(outTerca.promptText, /DIA DA SEMANA ABERTO PARA AGENDAMENTOS: terça-feira/i);

    // Reachability: Ler Dia Aberto Agenda node exists
    assert.ok(workflow.nodes.some(n => n.name === 'Ler Dia Aberto Agenda'));
    assert.equal(workflow.connections['Preparar Contexto Beautes'].main[0][0].node, 'Ler Dia Aberto Agenda');
    assert.equal(workflow.connections['Ler Dia Aberto Agenda'].main[0][0].node, 'Ler Estado Agendamento');
});
