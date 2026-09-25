"""Exercise the actual built AMD preview, with external traffic blocked.
All identities, stores and content are explicitly fictional. This is not native SPFx acceptance.
"""
from pathlib import Path
import hashlib, json, datetime, re
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).parent
BASE='http://127.0.0.1:4199/'
roles=['employee','leader','operator','owner','designAuthority','marketingParticipant','marketingReviewer']
report={'boundary':'OFFLINE_SIMULATED_SHAREPOINT_HOST_ACTUAL_BUILT_AMD','roles':[],'journeys':[],'externalRequests':[],'pageErrors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/far_cdx/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless=True)
    context=browser.new_context(viewport={'width':1280,'height':960})
    def route(r):
        if urlsplit(r.request.url).netloc!='127.0.0.1:4199':
            report['externalRequests'].append(r.request.url);r.abort()
        else:r.continue_()
    context.route('**/*',route)
    for role in roles:
        page=context.new_page();page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
        page.goto(BASE+'?view=app&role='+role)
        expect(page.locator('.overture-app')).to_be_visible()
        expect(page.locator('#preview-notice')).to_contain_text('OFFLINE PREVIEW')
        expect(page.locator('#preview-error')).to_be_empty()
        tabs=page.get_by_role('tab').all_text_contents()
        assert 'Cases' in tabs and 'Home' in tabs
        entry={'role':role,'tabs':tabs,'visited':[]}
        for tab in tabs:
            page.get_by_role('tab',name=tab,exact=True).click()
            expect(page.get_by_role('tabpanel')).to_be_visible()
            expect(page.get_by_role('tab',name=tab,exact=True)).to_have_attribute('aria-selected','true')
            entry['visited'].append(tab)
        page.get_by_role('tab',name='Home',exact=True).click()
        expect(page.get_by_role('heading',name='Home',exact=True)).to_be_focused()
        page.get_by_role('tab',name='Home',exact=True).focus()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab',name=tabs[1],exact=True)).to_be_focused()
        page.set_viewport_size({'width':390,'height':844})
        for tab in tabs:
            page.get_by_role('tab',name=tab,exact=True).click()
            size=page.locator('.overture-app').evaluate('(e)=>({width:e.clientWidth,scroll:e.scrollWidth})')
            assert size['scroll']<=size['width']+2, (role,tab,size)
        entry['mobileNoAppOverflow']=True
        entry['nativeRequests']=page.evaluate("window.FrontDoorPreview.requests.filter(x=>String(x.url||'').startsWith('https:')).length")
        report['roles'].append(entry);page.close()
    page=context.new_page();page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
    page.goto(BASE+'?view=app&role=marketingParticipant')
    page.get_by_role('tab',name='Cases',exact=True).click()
    page.get_by_label('Title',exact=True).fill('Offline browser smoke case')
    page.get_by_label('Problem statement',exact=True).fill('Synthetic fragmented preparation')
    page.get_by_label('Desired outcome',exact=True).fill('A reviewable synthetic brief')
    page.get_by_label('Sponsor (role, not a default person)',exact=True).fill('Fictional role')
    page.get_by_role('button',name='Create work',exact=True).click()
    expect(page.get_by_role('button',name='Save clarification',exact=True)).to_be_enabled()
    page.get_by_label('Sponsor (role, not a default person)',exact=True).fill('Corrected fictional role')
    page.get_by_role('button',name='Save clarification',exact=True).click()
    expect(page.get_by_role('button',name='Refresh status',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Refresh status',exact=True).click()
    expect(page.get_by_label('Sponsor (role, not a default person)',exact=True)).to_have_value('Corrected fictional role')
    report['journeys'].append('Synthetic CORE create, edited clarification and fresh status preserve the correction')
    page.get_by_role('tab',name='Marketing',exact=True).click()
    expect(page.get_by_role('heading',name='Marketing',exact=True)).to_be_focused()
    page.get_by_label('Approved objective (synthetic)',exact=True).fill('Offline browser reviewable campaign')
    expect(page.get_by_label('Approved objective (synthetic)',exact=True)).to_have_value('Offline browser reviewable campaign')
    page.get_by_role('button',name='Draft a campaign brief',exact=True).click()
    expect(page.get_by_role('button',name='Send for review',exact=True)).to_be_enabled()
    expect(page.get_by_label('Approved objective (synthetic)',exact=True)).to_have_value('Offline browser reviewable campaign')
    saved_record=page.get_by_role('button',name=re.compile('^Campaign brief — ')).inner_text()
    page.get_by_role('tab',name='Home',exact=True).click()
    expect(page.get_by_role('tab',name='Home',exact=True)).to_have_attribute('aria-selected','true')
    page.get_by_role('tab',name='Marketing',exact=True).click()
    expect(page.get_by_label('Approved objective (synthetic)',exact=True)).to_have_value('Offline browser reviewable campaign')
    record_button=page.get_by_role('button',name=re.compile('^Campaign brief — '))
    expect(record_button).to_have_text(saved_record,use_inner_text=True)
    record_button.click()
    expect(page.get_by_role('button',name='Send for review',exact=True)).to_be_enabled()
    report['journeys'].append('Synthetic Marketing brief saves/readbacks and survives tab changes')
    report['webLocksAvailable']=page.evaluate("typeof navigator.locks?.request === 'function'")
    page.close();context.close();browser.close()
assert not report['externalRequests'] and not report['pageErrors'], report
report['capturedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
report['pass']=True
report['bundleCandidates']={str(x.relative_to(ROOT)):hashlib.sha256(x.read_bytes()).hexdigest() for x in (ROOT/'dist').glob('ai-coe-front-door-web-part*.js')}
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
