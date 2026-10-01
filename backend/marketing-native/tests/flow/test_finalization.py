"""A new artifact's public version requires actual durable row readback."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'generator'))
from marketing_flow import command_flow
from marketing_validate import validate, walk

class Finalization(unittest.TestCase):
    def test_projection_uses_durably_finalized_result(self):
        definition=command_flow().definition();actions=dict(walk(definition['properties']['definition']['actions']))
        for name in ['Finalize_Native_Plan','Result_Is_Final','Final_Native_Plan_Write','Verify_Final_Native_Plan_Assert','Finalized_Plan']:
            self.assertIn(name,actions)
        for name in ['Build_Projection','Fresh_Result_Reauthorized','Command_Completed_Write']:
            self.assertIn("outputs('Finalized_Plan')",str(actions[name]),name)
        self.assertIn('Readback_Final_Native_Plan_Page',str(actions['Native_Completed_Write']))
        self.assertEqual(validate(definition),[])
        self.assertLessEqual(len(actions),500)
    def test_validator_rejects_early_projection_or_finalization(self):
        definition=command_flow().definition();actions=dict(walk(definition['properties']['definition']['actions']))
        self.assertIn('Finalize_Native_Plan',actions)
        actions['Finalize_Native_Plan']['runAfter']={'Plan':['Succeeded']}
        self.assertTrue(any('Finalize_Native_Plan: durable boundary' in x for x in validate(definition)))
        definition=command_flow().definition();actions=dict(walk(definition['properties']['definition']['actions']))
        actions['Build_Projection']['runAfter']={'For_each_write':['Succeeded']}
        self.assertTrue(any('Build_Projection: durable boundary' in x for x in validate(definition)))

if __name__=='__main__':unittest.main()
