import re
import unittest
from pathlib import Path


class PlannerWiringTests(unittest.TestCase):
    def test_preview_and_panel_use_identical_planner_assets(self):
        def assets(filename):
            text = Path('docs/control', filename).read_text(encoding='utf-8')
            return set(re.findall(r'(?:src|href)="(planner-(?:engine|weather|ui)\.js[^\"]*|planner\.css[^\"]*)"', text))
        self.assertEqual(assets('index.html'), assets('planner-preview.html'))
        self.assertEqual(len(assets('index.html')), 4)

    def test_preview_cannot_publish_restaurant_data(self):
        text = Path('docs/control/planner-ui.js').read_text(encoding='utf-8')
        self.assertIn("if(state.preview){setStatus('Предпросмотр: сохранение и публикация в ресторан отключены');return;}", text)
