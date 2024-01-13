const express = require('express')
const app = express()
const host = 3000
const mongoose = require('mongoose')
app.use(express.json())
const bcrypt = require('bcrypt');

const cors = require('cors')
app.use(cors())

mongoose.connect('mongodb://127.0.0.1:27017/Connectify');
const db = mongoose.connection;
db.once('open',()=>{
    console.log('DB Connected...');
})


// Define a User Schema
const userSchema = mongoose.model('User', {
    name: String,
    contact: Number,
    username: String,
    password: String,
    followers: [String],
    following:[String],
    posts: [{
        sno: Number,
        content: String,
        likes: Number,
        comments: String,
    }],
    notifications: [{
        type: String,  // 'followRequest'
        sender: String,  // Username of the follower
    }],
});


app.post('/signup', async (req, res) => {
    try {
        const existingUser = await userSchema.findOne({ username: req.body.username })

        if(existingUser){
            return res.status(409).json({ "msg" : "Username already exists" })
        }
        const password= req.body.password;
        const hashedPassword= await bcrypt.hash(password,10);

        const newUser = new userSchema({
            name: req.body.name,
            contact: req.body.contact,
            username: req.body.username,
            password: hashedPassword,
            followers: [],
            following:[],
            posts: []
        })

        const saveUser = await newUser.save()
        res.status(201).json({mes : "User created successfully"});
    }

    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.post('/login', async (req, res) => {
    try {
        const user = await userSchema.findOne({ username: req.body.username });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const passwordMatch = await bcrypt.compare(req.body.password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ message: 'Login successful' });
    }
     catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



app.post('/createPost', async (req, res) => {
    try {
        const username = req.body.username;
        const content = req.body.content;

        // Find the user by username
        const user = await userSchema.findOne({ username });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newPost = {
            sno: user.posts.length + 1,
            content:req.body.content,
            likes: 0,
            comments: '',
        };

        // Add the new post to the user's posts array
        user.posts.push(newPost);

        // Save the updated user object
        await user.save();

        res.status(201).json({ message: 'Post created successfully', post: newPost });
    } 
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/sendFollowRequest/:targetUsername', async (req, res) => {
    try {
        const targetUsername = req.params.targetUsername;
        const senderUsername = req.body.senderUsername;

        const targetUser = await userSchema.findOne({ username: targetUsername });
        const senderUser = await userSchema.findOne({ username: senderUsername });

        if (!targetUser || !senderUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if the request has already been sent
        const isFollowRequestAlreadySent = (notification) => {
            return notification.type === 'followRequest' && notification.sender === senderUsername;
        };
        
        if (targetUser.notifications.some(isFollowRequestAlreadySent)) {
            return res.status(400).json({ error: 'Follow request already sent' });
        }
        

        // Add follow request notification to the target user
        targetUser.notifications.push({
            type: 'followRequest',
            sender: senderUsername,
        });

        await targetUser.save();

        res.status(200).json({ message: 'Follow request sent successfully' });
    } 
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
    
});


app.post('/acceptFollowRequest/:senderUsername', async (req, res) => {
    try {
        const senderUsername = req.params.senderUsername;
        const targetUsername = req.body.targetUsername;

        // Check if the sender and target users exist
        const targetUser = await userSchema.findOne({ username: targetUsername });
        const senderUser = await userSchema.findOne({ username: senderUsername });

        if (!targetUser || !senderUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if there is a follow request from the sender
        const followRequestIndex = targetUser.notifications.findIndex(notification => 
            notification.type === 'followRequest' && notification.sender === senderUsername);

        if (followRequestIndex === -1) {
            return res.status(400).json({ error: 'Follow request not found' });
        }

        // Remove the follow request notification
        targetUser.notifications.splice(followRequestIndex, 1);

        // Add the sender to the target user's followers
        targetUser.followers.push(senderUsername);

        // Add the target user to the sender's following list
        senderUser.following.push(targetUsername);

        await targetUser.save();
        await senderUser.save();

        res.status(200).json({ message: 'Follow request accepted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


const isFollower = (req, res, next) => {
    const username = req.params.username; // Username of the user whose posts are being requested
    const requesterUsername = req.headers['x-requester-username']; // Username of the requester

    // Check if the requester is a follower
    if (!username || !requesterUsername || !req.app.locals.users[username].followers.includes(requesterUsername)) {
        return res.status(403).json({ error: 'Unauthorized. You are not a follower.' });
    }

    next();
};

// Get posts for a particular user (e.g., Alexa)
app.get('/posts/:username', isFollower, async (req, res) => {
    try {
        const username = req.params.username;
        const user = await userSchema.findOne({ username });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Return posts only to followers
        res.status(200).json(user.posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.listen(host,()=>{
    console.log("server started...");
});
