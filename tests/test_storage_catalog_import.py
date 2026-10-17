import tempfile
import unittest
from pathlib import Path
from openpyxl import Workbook
from storage_catalog_import import hours, production_variants, parse_storage, merge_catalog


class StorageImportTests(unittest.TestCase):
    def workbook(self, path, rows):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Общее'
        for _ in range(4): sheet.append([])
        sheet.append([None, 'общий срок хранения', 'размораживание', None, 'хранение', 'маркировка', 'место маркировки', 'маркировка', 'место маркировки'])
        for row in rows: sheet.append(row)
        workbook.save(path)
        workbook.close()

    def test_duration_units_and_no_temperature_or_hold_addition(self):
        self.assertEqual(hours('1 час 30 минут'), 1.5)
        self.assertEqual(hours('70 часов 30 минут'), 70.5)
        self.assertEqual(hours('ТД = 12 часов (вкл. выдержку 1 час)'), 12)
        self.assertEqual(hours('ТД = 14 дей (t +0_+30°С)'), 336)
        with self.assertRaises(ValueError): hours('12-24 часа')
        with self.assertRaises(ValueError): hours('24')
        with self.assertRaises(ValueError): hours('-12 часов')

    def test_conditional_production_is_not_added_together(self):
        variants = production_variants('ТД = 5 дней - в пэне; Д = 24 часа в диспенсере')
        self.assertEqual([row['hours'] for row in variants], [120, 24])
        variants = production_variants('ТД = 12 часов (выдержка 1 час) ТД = 2 часа (с решёткой)')
        self.assertEqual([row['hours'] for row in variants], [12, 2])

    def test_parser_derives_missing_total_and_validates_sum(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sample.xlsx'
            self.workbook(path, [['Ветчина', None, '*', '24 часа', '48 часов', 'П/T/Д = 24ч./48ч.', 'Упаковка', 'ТД = 4 часа', 'Пэн']])
            rows = parse_storage(path)['items']
            self.assertEqual(rows[0]['prepHours'], 72)
            self.workbook(path, [['Ветчина', '80 часов', '*', '24 часа', '48 часов', '', '', 'ТД = 4 часа', 'Пэн']])
            with self.assertRaisesRegex(ValueError, 'не равен'): parse_storage(path)

    def test_duplicate_and_formula_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sample.xlsx'
            row = ['Сыр', '12 часов', '', '', 'пэн', '72 часа', 'сливс', '4 часа', 'пэн']
            self.workbook(path, [row, row])
            with self.assertRaisesRegex(ValueError, 'Повторяется'): parse_storage(path)
            row[1] = '=24*2'
            self.workbook(path, [row])
            with self.assertRaisesRegex(ValueError, 'Формулы'): parse_storage(path)

    def test_merge_preserves_missing_and_detects_changes(self):
        old = [{'name': 'Сыр', 'prepRaw': '12 часов'}, {'name': 'Молоко', 'prepRaw': '24 часа'}]
        rows, changes, retained = merge_catalog(old, [{'name': ' сыр ', 'prepRaw': '18 часов'}])
        self.assertEqual(retained, 1)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]['name'], 'Молоко')
        self.assertEqual(changes[0]['fields'], ['prepRaw'])
