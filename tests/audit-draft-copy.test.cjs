'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const load=require('./audit-source-loader.cjs');
test('draft notices never claim device persistence or confirmed saving after an unknown failure',()=>{
 const failure=load('controls/FailureNotice.tsx');
 const html=renderToStaticMarkup(React.createElement(failure.FailureNotice,{failureClass:'INCONCLUSIVE',userMessage:'Synthetic unconfirmed save'}));
 assert.ok(!html.includes('on this device'));
 assert.ok(html.includes('Your answers remain on this screen.'));
 assert.ok(!html.includes('nothing is duplicated'));
 assert.equal(load('components/workflows/shared.tsx').DRAFT_SAVED_TEXT,'Draft saved.');
 assert.ok(!load('components/app/AppHero.tsx').SAVE_FAILED_TEXT.includes('device'));
 assert.ok(!load('components/pages/blocks/WorkCommandBlock.tsx').SAVE_FAILED_TEXT.includes('device'));
});
