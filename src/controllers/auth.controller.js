const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock Database for Users
const mockUsers = []; 

exports.signup = async (req, res) => {
    try {
        // We extract email and phoneNumber instead of username
        const { email, phoneNumber, password } = req.body;

        // 1. Validation: Ensure they provided a password AND at least one contact method
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        if (!email && !phoneNumber) {
            return res.status(400).json({ error: 'Please provide either an email or a phone number to sign up' });
        }

        // 2. Check if a user with this exact email OR phone number already exists
        const userExists = mockUsers.find(u => 
            (email && u.email === email) || 
            (phoneNumber && u.phoneNumber === phoneNumber)
        );

        if (userExists) {
            return res.status(400).json({ error: 'An account with this email or phone number already exists' });
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Create and store the new user
        const newUser = {
            id: mockUsers.length + 1,
            email: email || null,               // Store null if they didn't provide it
            phoneNumber: phoneNumber || null,   // Store null if they didn't provide it
            password: hashedPassword,
            balance: 0 // Starting balance
        };
        mockUsers.push(newUser);

        res.status(201).json({ success: true, message: 'Account created successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during signup' });
    }
};

exports.login = async (req, res) => {
    try {
        // The user can type their email OR phone number into a single input field
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Please provide your login details and password' });
        }

        // 1. Find the user by checking if the identifier matches either an email OR a phone number
        const user = mockUsers.find(u => 
            u.email === identifier || u.phoneNumber === identifier
        );

        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // 2. Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // 3. Generate JWT Token using their available details
        const token = jwt.sign(
            { id: user.id, email: user.email, phoneNumber: user.phoneNumber },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: { 
                id: user.id, 
                email: user.email, 
                phoneNumber: user.phoneNumber, 
                balance: user.balance 
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
};