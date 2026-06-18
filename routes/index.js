const express = require('express');
const router = express.Router();

// Login page
router.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/hms');
    }
    res.render('login', { title: 'Login - HMS Node' });
});

module.exports = router;
