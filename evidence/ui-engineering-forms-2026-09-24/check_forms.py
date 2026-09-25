"""Offline built-bundle checks for every Engineering form's existing 48rem layout."""
from pathlib import Path
import json
import os
import re
from playwright.sync_api import sync_playwright, expect

E = Path(__file__).parent
BASE = 'http://127.0.0.1:4173/'
FORMS = ['Explore an AI idea', 'Check a tool or task', 'Get help or training']
LAYOUTS = [('desktop', 1440, 1050, ''), ('mobile', 390, 844, ''), ('narrow', 900, 1000, '&layout=narrow&width=560')]
checks = []
errors = []
remote = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE'])
    page = browser.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))

    def route(r):
        if r.request.url.startswith(BASE):
            r.continue_()
        else:
            remote.append(r.request.url)
            r.abort()
    page.route('**/*', route)

    for title in FORMS:
        for layout, width, height, extra in LAYOUTS:
            page.set_viewport_size({'width': width, 'height': height})
            page.goto(BASE + '?view=app&organization=CloudWave&role=employee' + extra, wait_until='networkidle')
            expect(page.locator('#preview-error')).to_have_text('')
            page.get_by_role('tab', name='Engineering', exact=True).click()
            heading = page.get_by_role('heading', name='Engineering', exact=True)
            expect(heading).to_be_focused()
            expect(page.locator('.ai-app-starters--engineering .ai-app-starter')).to_have_count(len(FORMS))
            expect(page.locator('#ai-app-panel-engineering .ai-workflow-shell')).to_have_count(0)
            panel_width = page.locator('#ai-app-panel-engineering').bounding_box()['width']
            page.get_by_role('button', name=re.compile('^' + re.escape(title))).click()
            form = page.locator('#ai-app-panel-engineering .ai-workflow-shell')
            expect(form).to_have_count(1)
            expect(form.locator('.overture-card')).to_be_visible()
            geometry = form.evaluate('''e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {width:r.width,parentWidth:p.width,maxWidth:getComputedStyle(e).maxWidth,font:parseFloat(getComputedStyle(document.documentElement).fontSize),left:r.left-p.left,right:p.right-r.right}}''')
            if layout == 'narrow':
                # The existing narrow-column rule deliberately fills the already constrained host column.
                assert geometry['maxWidth'] == 'none', geometry
                assert geometry['width'] == geometry['parentWidth'], geometry
            else:
                assert float(geometry['maxWidth'].replace('px', '')) == 48 * geometry['font'], geometry
            assert abs(geometry['left'] - geometry['right']) < 1, geometry
            assert geometry['width'] <= geometry['parentWidth'], geometry
            if layout == 'desktop':
                assert geometry['width'] < geometry['parentWidth'], geometry
            assert page.locator('#ai-app-panel-engineering').bounding_box()['width'] == panel_width
            assert heading.evaluate('(e)=>e.closest(".ai-workflow-shell")===null')
            assert page.get_by_role('tablist').evaluate('(e)=>e.closest(".ai-workflow-shell")===null')
            overflow = page.evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})')
            assert overflow['scroll'] <= overflow['width'] + 1, overflow
            if title == 'Get help or training':
                form.get_by_role('button', name='I am new to AI', exact=True).click()
                form.get_by_role('button', name='Continue', exact=True).click()
            textbox = form.locator('textarea, input[type="text"]').first
            expect(textbox).to_be_visible()
            text = 'Invented Engineering layout check'
            textbox.fill(text)
            page.get_by_role('tab', name='Home', exact=True).click()
            expect(page.locator('#app').get_by_role('alert')).to_contain_text('Unsaved changes')
            page.get_by_role('button', name='Keep editing', exact=True).click()
            expect(textbox).to_have_value(text)
            expect(form).to_be_visible()
            if layout != 'narrow':
                page.evaluate('window.scrollTo(0, 0)')
                page.screenshot(path=str(E / (re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') + '-' + layout + '.png')), full_page=True)
            page.get_by_role('tab', name='Home', exact=True).click()
            page.get_by_role('button', name='Discard unsaved changes and leave', exact=True).click()
            expect(page.get_by_role('tab', name='Home', exact=True)).to_have_attribute('aria-selected', 'true')
            checks.append({'form': title, 'layout': layout, 'geometry': geometry, 'outerPageWidthUnchanged': True, 'unsavedGuard': True, 'overflow': overflow})
            (E / 'browser-progress.json').write_text(json.dumps(checks, indent=2) + '\n')
    assert len(checks) == len(FORMS) * len(LAYOUTS) == 9
    assert {c['form'] for c in checks} == set(FORMS)
    assert not errors and not remote, {'errors': errors, 'remote': remote}
    result = {'status': 'PASS', 'scope': 'LOCAL_BUILT_BUNDLE_SYNTHETIC_ONLY', 'forms': FORMS, 'checks': checks, 'javascriptErrors': errors, 'externalRequests': remote}
    (E / 'browser-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    browser.close()
