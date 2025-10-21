// Test file to demonstrate PR automation
// This simulates a DGuard API endpoint for testing

const express = require('express');
const router = express.Router();

// Example endpoint with potential issues for testing
router.get('/api/users', (req, res) => {
    // Missing authentication - security issue
    const users = req.db.users.findAll();
    res.json(users);
});

// Another endpoint with different issues
router.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // No input validation - security issue
    const user = findUser(username, password);
    
    if (user) {
        // Missing CORS headers
        res.json({ token: generateToken(user) });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Endpoint missing error handling
router.get('/api/data/:id', (req, res) => {
    const data = database.getData(req.params.id); // Could throw error
    res.json(data);
});

module.exports = router;