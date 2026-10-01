"""Real built-bundle browser checks for the four requested UAT refinements.
Only the local preview and synthetic data are used; remote requests are blocked.
"""
from pathlib import Path
import hashlib,json,os
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
E=Path(__file__).parent
URL='http://127.0.0.1:4173/?view=app&organization=CloudWave&role=owner'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE'])
    page=browser.new_page(viewport={'width':1440,'height':1050})
    errors=[];remote=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(request):
        if request.request.url.startswith('http://127.0.0.1:4173/'):
            request.continue_()
        else:
            remote.append(request.request.url);request.abort()
    page.route('**/*',route)
    def tab(name):
        page.get_by_role('tab',name=name,exact=True).click()
        expect(page.get_by_role('heading',name=name,exact=True)).to_be_focused()
    page.goto(URL,wait_until='networkidle')
    expect(page.get_by_role('tab',name='Admin',exact=True)).to_be_visible()
    assert page.get_by_role('tab',name='System map',exact=True).count()==0
    tab('Improvement')
    assert page.get_by_text('Operator commissioning: manual review and publication',exact=True).count()==0
    expect(page.get_by_role('button',name='Share feedback',exact=False)).to_be_visible()
    tab('Engineering')
    starters=page.locator('.ai-app-starters--engineering')
    spacing=starters.evaluate('(e)=>({top:getComputedStyle(e).paddingTop,bottom:getComputedStyle(e).paddingBottom})')
    assert spacing=={'top':'24px','bottom':'24px'},spacing
    expect(page.get_by_role('button',name='Explore an AI idea',exact=False)).to_be_visible()
    tab('Cases')
    expect(page.get_by_role('heading',name='Start a new case',exact=True)).to_be_visible()
    expect(page.get_by_label('Case title',exact=True)).to_have_value('')
    expect(page.get_by_role('button',name='Create case',exact=True)).to_be_disabled()
    case=page.locator('.ai-case-workspace')
    assert 'real command keys' not in case.inner_text()
    page.get_by_label('Case title',exact=True).fill('UAT example — weekly reporting')
    page.get_by_label('Problem statement',exact=True).fill('Invented practice task: preparing the weekly report requires repeated copying.')
    page.get_by_label('Desired outcome',exact=True).fill('Produce one checked report with the source references kept beside each figure.')
    page.get_by_label('Business sponsor',exact=True).fill('Operations lead — fictional UAT role')
    page.get_by_role('tab',name='Engineering',exact=True).click()
    expect(page.locator('#app').get_by_role('alert')).to_contain_text('Save case changes or Save response')
    page.get_by_role('button',name='Keep editing',exact=True).click()
    expect(page.get_by_label('Case title',exact=True)).to_have_value('UAT example — weekly reporting')
    page.get_by_role('button',name='Create case',exact=True).click()
    expect(case.get_by_role('status')).to_contain_text('Case saved')
    expect(page.get_by_role('heading',name='Requested information',exact=True)).to_be_visible()
    options=page.get_by_label('Information to provide',exact=True).locator('option').all_text_contents()
    assert any(x.startswith('Technical details') for x in options) and not any('EVP-' in x for x in options)
    page.get_by_label('Information to provide',exact=True).select_option(label=next(x for x in options if x.startswith('Technical details')))
    response=page.get_by_label('Your response',exact=True)
    expect(response).to_have_attribute('rows','6')
    response.fill('Synthetic UAT response: use a permitted test export and keep human review before any distribution.')
    page.get_by_label('Certainty',exact=True).select_option('ASSUMED')
    expect(page.get_by_role('button',name='New case',exact=True)).to_be_disabled()
    expect(page.get_by_label('Information to provide',exact=True)).to_be_disabled()
    page.get_by_role('button',name='Save response',exact=True).click()
    expect(page.get_by_label('Information to provide',exact=True)).to_be_enabled()
    assert 'Command: completed' not in case.inner_text()
    expect(page.get_by_role('button',name='Check required information',exact=True)).to_be_visible()
    desktop=page.locator('.ai-case-fields').evaluate('''(grid)=>Array.from(grid.querySelectorAll('input,textarea')).map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect(),l=e.parentElement.querySelector('label').getBoundingClientRect(),s=getComputedStyle(e);return {id:e.id,width:r.width,parentWidth:p.width,height:r.height,labelAbove:l.bottom<=r.top,border:s.borderTopWidth,display:s.display}})''')
    assert all(r['labelAbove'] and abs(r['width']-r['parentWidth'])<2 and r['border']=='1px' for r in desktop),desktop
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(E/'cases-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    mobile=page.evaluate('({scroll:document.documentElement.scrollWidth,viewport:innerWidth})')
    if mobile['scroll']>mobile['viewport']+1:
        print(json.dumps(page.locator('body *').evaluate_all('''els=>els.map(e=>({tag:e.tagName,id:e.id,css:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,60)})).filter(e=>e.width>0 && e.right>innerWidth+1).slice(0,25)'''),indent=2))
        page.screenshot(path=str(E/'mobile-overflow.png'),full_page=True)
    assert mobile['scroll']<=mobile['viewport']+1,mobile
    assert page.locator('.ai-case-fields').evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==1
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(E/'cases-mobile.png'),full_page=True)
    expect(page.get_by_role('button',name='New case',exact=True)).to_be_enabled()
    page.get_by_role('button',name='New case',exact=True).click()
    expect(page.get_by_label('Case title',exact=True)).to_have_value('')
    page.get_by_role('button',name='Show saved cases',exact=True).click()
    expect(page.get_by_role('button',name='UAT example — weekly reporting',exact=False)).to_be_enabled()
    # Verify the removed tab does not return for a non-owner operator either.
    page.goto(URL.replace('role=owner','role=operator'),wait_until='networkidle')
    assert page.get_by_role('tab',name='System map',exact=True).count()==0
    assert page.get_by_role('tab',name='Admin',exact=True).count()==0
    assert not errors and not remote,{'errors':errors,'remote':remote}
    assert page.locator('#preview-error').inner_text()==''
    result={'status':'PASS','scope':'BUILT_BUNDLE_LOCAL_SYNTHETIC_UAT','systemMapRemovedOwnerAndOperator':True,'commissioningCardRemoved':True,'engineeringPadding':spacing,'caseCreateSaveResponseSelectAndNew':True,'caseUnsavedGuard':True,'readableFullWidthFields':desktop,'mobile':mobile,'javascriptErrors':errors,'externalRequests':remote,'screenshots':['cases-desktop.png','cases-mobile.png']}
    (E/'browser-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2));browser.close()
