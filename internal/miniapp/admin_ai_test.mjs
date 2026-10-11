import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { renderAISettings } from './static/admin-ai.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
const helpers = {escapeHtml:escape, escapeAttribute:escape, icon:() => '<svg></svg>'};

test('provider model identifiers and prompt cannot inject HTML into admin UI', () => {
	const model = '<img src=x onerror=alert(1)>';
	const result = renderAISettings({draft:{apiUrl:'https://provider.example/v1',apiKey:'',model,prompt:'</textarea><script>alert(1)</script>',enabled:true,keyConfigured:true},models:[model],verified:true},helpers);
	assert.ok(!result.includes('<img src=x'));
	assert.ok(!result.includes('<script>'));
	assert.ok(result.includes('aria-checked="true"'));
	assert.ok(result.includes('type="password"'));
	assert.ok(result.includes('Ключ сохранён'));
});

test('settings errors provide retry without losing form availability', () => {
	const result = renderAISettings({draft:null,error:'Сервер недоступен'},helpers);
	assert.ok(result.includes('role="alert"'));
	assert.ok(result.includes('data-action="admin-ai-load"'));
});

test('AI has a single switch at the top without introductory decoration', () => {
	const result = renderAISettings({draft:{enabled:true}},helpers);
	assert.equal((result.match(/data-input="admin-ai-enabled"/g) || []).length,1);
	assert.ok(result.indexOf('role="switch"') < result.indexOf('Подключение'));
	assert.ok(!result.includes('Помощник поддержки'));
	assert.ok(!result.includes('admin-ai__intro'));
});

test('AI replies remain peer messages for both customer and admin viewers', () => {
	const source = fs.readFileSync(new URL('./static/app.js',import.meta.url),'utf8');
	const start = source.indexOf('function renderSupportMessage(message)');
	const end = source.indexOf('function renderSupportMessageAttachment',start);
	for (const isAdmin of [true,false]) {
		const sandbox = {state:{data:{support:{isAdmin}},activeSupportThread:{ticket:{customerName:'Клиент'}}},supportText:() => ({you:'Вы',admin:'Поддержка'}),localizedText:ru => ru,escapeHtml:escape,renderSupportMessageBody:escape,formatSupportTime:()=> '12:00'};
		vm.createContext(sandbox);
		vm.runInContext(source.slice(start,end),sandbox);
		const result = sandbox.renderSupportMessage({id:1,authorRole:'ai',body:'Здравствуйте',createdAt:''});
		assert.ok(result.includes('ИИ-помощник'));
		assert.ok(result.includes('support-message--peer'));
		assert.ok(!result.includes('support-message--mine'));
	}
});

function saveHarness(post) {
	const source = fs.readFileSync(new URL('./static/app.js',import.meta.url),'utf8');
	const state = {
		currentPage:'admin', adminSection:'ai', adminSettingsDirty:true,
		adminAI:{dirty:true,busy:'',error:'',draft:{apiUrl:'https://provider.example/v1',apiKey:'test-key',model:'test-model',prompt:'Instructions',handoffAfter:'6',enabled:true}},
	};
	const context = vm.createContext({state,previewMode:false,post,render(){},showToast(){}});
	for (const name of ['adminEditorSaveState','saveAdminSettings','saveAdminAI']) {
		const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
		assert.ok(start>=0,name);
		const rest = source.slice(start);
		const next = rest.slice(1).search(/\n(?:async )?function /);
		vm.runInContext(next<0?rest:rest.slice(0,next+1),context);
	}
	return context;
}

test('the shared save action saves AI fields without changing unrelated runtime drafts', async () => {
	let complete;
	const calls=[];
	const context=saveHarness((url,body)=>{
		calls.push({url,body:JSON.parse(JSON.stringify(body))});
		return new Promise(resolve=>{complete=resolve;});
	});
	const operation=context.saveAdminSettings();
	assert.equal(context.adminEditorSaveState().busy,true);
	assert.equal(context.adminEditorSaveState().saving,true);
	assert.deepEqual(calls,[{url:'/api/mini-app/admin/ai/update',body:{apiUrl:'https://provider.example/v1',apiKey:'test-key',model:'test-model',prompt:'Instructions',handoffAfter:6,enabled:true}}]);
	complete({data:{apiUrl:'https://provider.example/v1',model:'test-model',prompt:'Instructions',handoffAfter:6,enabled:true,keyConfigured:true}});
	await operation;
	assert.equal(context.state.adminAI.draft.apiKey,'');
	assert.equal(context.adminEditorSaveState().dirty,false);
	assert.equal(context.adminEditorSaveState().busy,false);
	assert.equal(context.state.adminSettingsDirty,true);
});

test('failed AI saves retain the draft and keep the shared save button available',async()=>{
	const context=saveHarness(async()=>{throw new Error('offline');});
	await context.saveAdminSettings();
	assert.equal(context.state.adminAI.error,'offline');
	assert.equal(context.state.adminAI.draft.apiKey,'test-key');
	assert.equal(context.adminEditorSaveState().dirty,true);
	assert.equal(context.adminEditorSaveState().busy,false);
});
