"""Verify the final UI refinements against the real built bundle, offline only."""
from pathlib import Path
import json
import os
import re
from playwright.sync_api import sync_playwright, expect

E = Path(__file__).parent
BASE = 'http://127.0.0.1:4173/'
results = {'scope': 'BUILT_BUNDLE_LOCAL_SYNTHETIC_ONLY', 'roles': [], 'layouts': []}
errors = []
remote = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1050})
    page.on('pageerror', lambda e: errors.append(str(e)))

    def route(r):
        if r.request.url.startswith(BASE):
            r.continue_()
        else:
            remote.append(r.request.url)
            r.abort()

    page.route('**/*', route)

    def open_role(role):
        page.goto(BASE + '?view=app&organization=CloudWave&role=' + role, wait_until='networkidle')
        expect(page.locator('#preview-error')).to_have_text('')
        expect(page.locator('.ai-app-chips')).to_contain_text('Access confirmed')

    def tab(name):
        page.get_by_role('tab', name=name, exact=True).click()
        expect(page.get_by_role('heading', name=name, exact=True)).to_be_focused()

    def no_overflow():
        data = page.evaluate('({scroll:document.documentElement.scrollWidth, width:innerWidth})')
        assert data['scroll'] <= data['width'] + 1, data
        return data

    def screenshot(name):
        page.evaluate('window.scrollTo(0, 0)')
        page.screenshot(path=str(E / name), full_page=True)

    for role in ['owner', 'employee', 'leader', 'operator', 'designAuthority', 'marketingParticipant', 'marketingReviewer']:
        open_role(role)
        allowed = role in ['owner', 'leader', 'operator']
        entry = page.get_by_role('button', name='Review enterprise AI value', exact=False)
        assert entry.count() == int(allowed), role
        assert page.get_by_role('tab', name='Enterprise value', exact=True).count() == int(allowed), role
        assert page.locator('.ai-app-choice-button').count() == (3 if allowed else 2)
        if allowed:
            entry.click()
            expect(page.get_by_role('tab', name='Enterprise value', exact=True)).to_have_attribute('aria-selected', 'true')
        results['roles'].append({'role': role, 'enterpriseEntry': allowed})

    open_role('owner')
    tab('Cases')
    show = page.get_by_role('button', name='Show saved cases', exact=True)
    expect(show).to_have_attribute('aria-expanded', 'false')
    show.click()
    region = page.get_by_role('region', name='My saved cases', exact=True)
    expect(region).to_contain_text('No saved cases yet')
    hide = page.get_by_role('button', name='Hide saved cases', exact=True)
    expect(hide).to_be_enabled()
    expect(hide).to_have_attribute('aria-controls', 'ai-core-saved-cases')
    hide.focus()
    page.keyboard.press('Space')
    expect(region).to_have_count(0)
    expect(page.get_by_role('button', name='Show saved cases', exact=True)).to_have_attribute('aria-expanded', 'false')

    page.get_by_label('Case title', exact=True).fill('Final UI check — invented reporting case')
    page.get_by_role('button', name='Create case', exact=True).click()
    expect(page.locator('.ai-case-workspace').get_by_role('status')).to_contain_text('Case saved')
    selected = page.get_by_role('region', name='Selected case status', exact=True).inner_text()
    page.get_by_label('Problem statement', exact=True).fill('Unsubmitted practice answer must survive toggling')
    page.get_by_role('button', name='Show saved cases', exact=True).click()
    expect(region).to_contain_text('Final UI check — invented reporting case')
    expect(page.get_by_role('button', name='Hide saved cases', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Hide saved cases', exact=True).click()
    expect(region).to_have_count(0)
    page.get_by_role('button', name='Show saved cases', exact=True).focus()
    page.keyboard.press('Enter')
    expect(region).to_be_visible()
    expect(page.get_by_role('button', name='Hide saved cases', exact=True)).to_be_enabled()
    expect(page.get_by_label('Problem statement', exact=True)).to_have_value('Unsubmitted practice answer must survive toggling')
    expect(page.get_by_role('region', name='Selected case status', exact=True)).to_have_text(selected, use_inner_text=True)
    expect(page.get_by_role('button', name='New case', exact=True)).to_be_disabled()
    page.get_by_role('button', name='Discard changes', exact=True).click()
    results['caseToggle'] = {'emptyAndPopulated': True, 'keyboard': True, 'selectedCasePreserved': True, 'unsavedAnswersPreserved': True}

    for width, height in [(1440, 1050), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        row = page.locator('.ai-app-cases-explanation')
        expect(row.get_by_role('heading', name='What happens to a request')).to_be_visible()
        spacing = row.evaluate('(e)=>({padding:getComputedStyle(e).paddingTop,gap:e.firstElementChild.getBoundingClientRect().top-e.getBoundingClientRect().top})')
        assert spacing == {'padding': '24px', 'gap': 24}, spacing
        results['layouts'].append({'section': 'Cases', 'viewport': width, 'spacing': spacing, 'overflow': no_overflow()})
        screenshot(f'final-cases-{width}.png')

    open_role('marketingParticipant')
    tab('Marketing')
    marketing = page.locator('.ai-app-marketing')
    expect(marketing.locator('.ai-app-demo-banner')).to_have_count(1)
    expect(marketing.locator('.ai-app-demo-banner')).to_contain_text('Nothing here is business content or a live AI response')
    assert marketing.get_by_text('Synthetic workspace: real validators', exact=False).count() == 0
    results['marketingSingleWarning'] = True
    page.get_by_role('button', name='Labelled demonstration', exact=True).click()
    for width, height in [(1440, 1050), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        row = page.locator('.ai-app-starters--marketing-demo')
        expect(row.get_by_role('button', name=re.compile(r'^Campaign brief'))).to_be_visible()
        spacing = row.evaluate('(e)=>({padding:getComputedStyle(e).paddingBottom,gap:e.getBoundingClientRect().bottom-Math.max(...Array.from(e.children,c=>c.getBoundingClientRect().bottom))})')
        assert spacing == {'padding': '24px', 'gap': 24}, spacing
        expect(marketing.locator('.ai-app-demo-banner')).to_contain_text('Demo — no live actions')
        results['layouts'].append({'section': 'Marketing demo', 'viewport': width, 'spacing': spacing, 'overflow': no_overflow()})
        screenshot(f'final-marketing-{width}.png')

    tab('Improvement')
    for width, height in [(1440, 1050), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        row = page.locator('.ai-app-starters--spaced')
        expect(row.get_by_role('button', name='Register team AI use', exact=False)).to_be_visible()
        spacing = row.evaluate('(e)=>({padding:getComputedStyle(e).paddingTop,gap:e.firstElementChild.getBoundingClientRect().top-e.getBoundingClientRect().top})')
        assert spacing == {'padding': '24px', 'gap': 24}, spacing
        assert page.locator('#ai-app-panel-improvement .ai-workflow-shell').count() == 0
        results['layouts'].append({'section': 'Improvement', 'viewport': width, 'spacing': spacing, 'overflow': no_overflow()})
        screenshot(f'final-improvement-{width}.png')

    page.get_by_role('button', name='Register team AI use', exact=False).click()
    form = page.locator('#ai-app-panel-improvement .ai-workflow-shell')
    expect(form.locator('.overture-card')).to_be_visible()
    for width, height in [(1440, 1050), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        geometry = form.evaluate('''e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect(),c=e.querySelector('.overture-card').getBoundingClientRect();return {width:r.width,parentWidth:p.width,cardWidth:c.width,maxWidth:getComputedStyle(e).maxWidth,rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),left:r.left-p.left,right:p.right-r.right}}''')
        assert float(geometry['maxWidth'].replace('px', '')) == 48 * geometry['rootFont'], geometry
        assert abs(geometry['left'] - geometry['right']) < 1, geometry
        assert geometry['width'] <= geometry['parentWidth'], geometry
        if width == 1440:
            assert geometry['width'] < geometry['parentWidth'], geometry
        assert page.get_by_role('tablist').evaluate('(e)=>e.closest(".ai-workflow-shell")===null')
        assert page.get_by_role('heading', name='Improvement', exact=True).evaluate('(e)=>e.closest(".ai-workflow-shell")===null')
        results['layouts'].append({'section': 'Registration form', 'viewport': width, 'geometry': geometry, 'overflow': no_overflow()})
        screenshot(f'final-registration-{width}.png')

    assert len(results['roles']) == 7
    assert len(results['layouts']) == 8
    assert not errors and not remote, {'errors': errors, 'remote': remote}
    results.update({'status': 'PASS', 'javascriptErrors': errors, 'externalRequests': remote})
    (E / 'final-browser.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
    browser.close()
