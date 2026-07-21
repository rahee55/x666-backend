const express = require('express');
const adminUserController = require('../../controllers/admin/adminUserController');

const router = express.Router();

router.get('/', adminUserController.listUsers);
router.post('/', adminUserController.createUser);
router.get('/:id', adminUserController.getUser);
router.put('/:id', adminUserController.updateUser);
router.patch('/:id/status', adminUserController.updateUserStatus);
router.delete('/:id', adminUserController.deleteUser);

module.exports = router;
