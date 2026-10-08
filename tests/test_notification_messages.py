import unittest
from notification_messages import messages, recipients


class NotificationMessagesTests(unittest.TestCase):
    def setUp(self):
        self.profiles = [
            {'telegram_id': 1, 'full_name': 'Иван', 'activation_status': 'active'},
            {'telegram_id': 2, 'full_name': 'Анна', 'activation_status': 'archived'},
            {'telegram_id': 3, 'full_name': 'Новый сотрудник', 'activation_status': 'active'},
        ]

    def test_all_includes_new_employee_and_excludes_archived(self):
        self.assertEqual([1, 3], [p['telegram_id'] for p in recipients({'audience': 'all', 'recipient_ids': [1, 2]}, self.profiles)])

    def test_selected_does_not_expand_audience(self):
        self.assertEqual([1], [p['telegram_id'] for p in recipients({'audience': 'selected', 'recipient_ids': [1, 2]}, self.profiles)])

    def test_messages_fit_limit_and_keep_mentions_whole(self):
        profiles = [{'telegram_id': i, 'full_name': '<Имя>' * 30, 'activation_status': 'active'} for i in range(1, 100)]
        result = messages({'audience': 'all', 'message': '&' * 2000}, profiles)
        self.assertTrue(all(len(text) <= 3800 for text in result))
        self.assertEqual(99, sum(text.count('tg://user?id=') for text in result))
        self.assertTrue(all(text.count('<a ') == text.count('</a>') for text in result))
        self.assertNotIn('<Имя>', ''.join(result))
