const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const stats = {
            doctors: 12,
            patients: 150,
            appointments: 45,
            inpatients: 8
        };

        res.render('dashboard', { 
            title: 'Dashboard - HMS Node',
            stats: stats
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
