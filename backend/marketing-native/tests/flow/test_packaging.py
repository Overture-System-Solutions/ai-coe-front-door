"""Packaging tests exercise actual generated import-layout ZIP bytes, not fixtures."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
import zipfile
from xml.etree import ElementTree as ET
from test_flow import ROOT, generate, walk


class PackageDefinition(unittest.TestCase):
    def test_isolated_off_solution_and_exact_definitions(self):
        self.assertTrue((ROOT / 'generator/marketing_package.py').is_file(), 'No native solution packager')
        import marketing_package
        f = generate()
        data = marketing_package.build_zip(f)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            self.assertNotIn('Script.cs', z.namelist())
            self.assertFalse(any(n.lower().startswith('connectors/') for n in z.namelist()))
            m = ET.fromstring(z.read('solution.xml')).find('SolutionManifest')
            self.assertEqual(m.findtext('UniqueName'), 'AICoEMarketingAutomation')
            self.assertEqual(m.findtext('Version'), '1.0.0.0')
            self.assertEqual(m.findtext('Publisher/CustomizationPrefix'), 'aicoe')
            x = ET.fromstring(z.read('customizations.xml'))
            w = x.findall('./Workflows/Workflow')
            self.assertEqual(len(w), 1)
            self.assertEqual(w[0].findtext('StateCode'), '0')
            self.assertEqual(w[0].findtext('StatusCode'), '1')
            self.assertEqual(w[0].attrib['WorkflowId'].strip('{}'), f.guid)
            self.assertEqual(json.loads(z.read(w[0].findtext('JsonFileName').lstrip('/'))), f.definition())
            refs = {r.attrib['connectionreferencelogicalname']: r for r in x.findall('./connectionreferences/connectionreference')}
            self.assertEqual(set(refs), {'aicoe_marketing_sharepoint', 'aicoe_marketingintegrity', 'aicoe_marketingclaude'})
            self.assertEqual(refs['aicoe_marketingintegrity'].findtext('connectorid'), '/providers/Microsoft.PowerApps/apis/UNBOUND_MARKETING_INTEGRITY')
            self.assertIsNone(refs['aicoe_marketingintegrity'].find('customconnectorid'))
            self.assertEqual(refs['aicoe_marketingclaude'].findtext('customconnectorid/connectorid'), '9d027c49-6154-5783-9503-a0e9f0458709')
        self.assertEqual(data, marketing_package.build_zip(generate()), 'Build must be deterministic')


if __name__ == '__main__':
    unittest.main()
