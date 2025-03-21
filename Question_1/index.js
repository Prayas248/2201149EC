require('dotenv').config();  // Load environment variables
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const HEAP_FILE = 'heap.json';
const POPULAR_POSTS_FILE = 'popular_posts.json';

const AUTH_URL = process.env.AUTH_URL;
const CLIENT_DETAILS = {
    companyName: process.env.COMPANY_NAME,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    ownerName: process.env.OWNER_NAME,
    ownerEmail: process.env.OWNER_EMAIL,
    rollNo: process.env.ROLL_NO
};

let accessToken = null;
let tokenExpiry = 0;

async function fetchNewToken() {
    try {
        console.log("Fetching new token...");
        const response = await axios.post(AUTH_URL, CLIENT_DETAILS);
        
        accessToken = response.data.access_token;
        tokenExpiry = response.data.expires_in * 1000 + Date.now();
        
        console.log("New token acquired.");
    } catch (error) {
        console.error("Error fetching token:", error.message);
    }
}

async function getValidToken() {
    if (!accessToken || Date.now() >= tokenExpiry) {
        await fetchNewToken();
    }
    return accessToken;
}

class MaxHeap {
    constructor() {
        this.heap = [];
        this.idSet = new Set();
    }

    insert(item) {
        if (!this.idSet.has(item.id)) {
            item.fetchTime = Date.now();
            this.heap.push(item);
            this.idSet.add(item.id);
            this.bubbleUp(this.heap.length - 1);
        }
    }

    bubbleUp(index) {
        while (index > 0) {
            let parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].value >= this.heap[index].value) {
                break;
            }
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }

    getTopN(n) {
        return [...this.heap]
            .sort((a, b) => b.value - a.value)
            .slice(0, n);
    }

    getLatestN(n) {
        return [...this.heap]
            .sort((a, b) => b.fetchTime - a.fetchTime)
            .slice(0, n);
    }

    toJSON() {
        return JSON.stringify(this.heap, null, 2);
    }

    loadFromFile(filename) {
        if (fs.existsSync(filename)) {
            try {
                const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
                this.heap = data;
                this.idSet = new Set(data.map(item => item.id));
            } catch (error) {
                console.error(`Error loading heap from file ${filename}:`, error);
            }
        }
    }

    saveToFile(filename) {
        fs.writeFileSync(filename, this.toJSON());
    }

    clear() {
        this.heap = [];
        this.idSet.clear();
    }
}

// Create Heaps
const userHeap = new MaxHeap();
const postHeap = new MaxHeap();

userHeap.loadFromFile(HEAP_FILE);
postHeap.loadFromFile(POPULAR_POSTS_FILE);

async function fetchUsers(token) {
    try {
        console.log("Fetching users...");
        const userResponse = await axios.get(`${process.env.BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!userResponse.data || !userResponse.data.users) {
            throw new Error("Invalid user response data");
        }

        const users = userResponse.data.users;
        userHeap.clear();

        for (const userId in users) {
            console.log(`Fetching posts for user ${userId}...`);
            const postResponse = await axios.get(`${process.env.BASE_URL}/users/${userId}/posts`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!postResponse.data || !postResponse.data.posts) {
                console.warn(`No posts found for user ${userId}`);
                continue;
            }

            const postCount = postResponse.data.posts.length;
            userHeap.insert({ id: userId, name: users[userId], value: postCount });
        }

        userHeap.saveToFile(HEAP_FILE);
        console.log('User heap updated.');
    } catch (error) {
        console.error('Error fetching users:', error.message);
    }
}

async function fetchPopularPosts(token) {
    try {
        console.log("Fetching users to retrieve posts...");
        const userResponse = await axios.get(`${process.env.BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!userResponse.data || !userResponse.data.users) {
            throw new Error("Invalid user response data");
        }

        const users = userResponse.data.users;
        postHeap.clear();

        for (const userId in users) {
            console.log(`Fetching posts for user ${userId}...`);
            const postResponse = await axios.get(`${process.env.BASE_URL}/users/${userId}/posts`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!postResponse.data || !Array.isArray(postResponse.data.posts)) {
                console.warn(`No posts found for user ${userId}`);
                continue;
            }

            for (const post of postResponse.data.posts) {
                console.log(`Fetching comments for post ${post.id}...`);
                const commentResponse = await axios.get(`${process.env.BASE_URL}/posts/${post.id}/comments`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!commentResponse.data || !Array.isArray(commentResponse.data.comments)) {
                    console.warn(`No comments found for post ${post.id}`);
                    continue;
                }

                const commentCount = commentResponse.data.comments.length;
                postHeap.insert({ 
                    id: post.id, 
                    title: post.title, 
                    value: commentCount, 
                    fetchTime: Date.now() 
                });
            }
        }

        postHeap.saveToFile(POPULAR_POSTS_FILE);
        console.log('Post heap updated.');
    } catch (error) {
        console.error('Error fetching popular posts:', error.message);
    }
}

// API Routes
app.get('/users', async (req, res) => {
    try {
        const token = await getValidToken();
        if (userHeap.heap.length === 0) {
            await fetchUsers(token);
        }
        res.json({ topUsers: userHeap.getTopN(5) });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching top users' });
    }
});

app.get('/posts', async (req, res) => {
    try {
        const token = await getValidToken();
        if (postHeap.heap.length === 0) {
            await fetchPopularPosts(token);
        }

        const sortedPosts = postHeap.heap.sort((a, b) => b.value - a.value);
        const maxComments = sortedPosts[0]?.value || 0;
        const mostPopularPosts = sortedPosts.filter(post => post.value === maxComments);

        res.json({ mostPopularPosts });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Error fetching posts' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
