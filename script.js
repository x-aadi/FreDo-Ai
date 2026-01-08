// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
    apiKey: "AIzaSyAwSDGt8fi9wd-r4eH6iM5vHKuLmcJ1Ajo",
    authDomain: "fredo-ai-972da.firebaseapp.com",
    projectId: "fredo-ai-972da",
    storageBucket: "fredo-ai-972da.firebasestorage.app",
    messagingSenderId: "472370985214",
    appId: "1:472370985214:web:83e36a28fb1a2b7f3a0daf"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==================== GLOBAL VARIABLES ====================
let currentChatId = null;
let voiceMode = false;
let isSidebarOpen = false;

// ==================== CHAT MANAGEMENT ====================
async function createNewChat() {
    try {
        const doc = await db.collection("chats").add({
            title: "New Chat",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentChatId = doc.id;
        
        // Clear chat UI
        document.getElementById("chat").innerHTML = `
            <div id="emptyState" class="empty-state">
                <h2>New Chat Started</h2>
                <p>What would you like to learn?</p>
            </div>
        `;
        
        // Close sidebar
        toggleSidebar();
        
        // Refresh chat list
        loadChatList();
        
        // Focus input
        document.getElementById("userInput").focus();
        
        return doc.id;
    } catch (error) {
        console.error("Error creating chat:", error);
        alert("Failed to create new chat. Please check your connection.");
        return null;
    }
}

async function loadChatList() {
    const list = document.getElementById("chatList");
    if (!list) return;
    
    list.innerHTML = '';
    
    try {
        const snapshot = await db.collection("chats")
            .orderBy("updatedAt", "desc")
            .limit(20)
            .get();
        
        if (snapshot.empty) {
            list.innerHTML = '<div class="empty-state"><p>No chats yet</p></div>';
        } else {
            snapshot.forEach(doc => {
                const data = doc.data();
                const btn = document.createElement("button");
                btn.className = "chat-item" + (doc.id === currentChatId ? " active" : "");
                btn.innerHTML = `
                    <span class="chat-title">${data.title || "Untitled Chat"}</span>
                    <span class="chat-date">${formatChatDate(data.updatedAt?.toDate() || new Date())}</span>
                `;
                btn.onclick = () => {
                    loadChat(doc.id);
                    toggleSidebar();
                };
                list.appendChild(btn);
            });
        }
    } catch (error) {
        console.error("Error loading chat list:", error);
        list.innerHTML = '<div class="error">Failed to load chats</div>';
    }
}

async function loadChat(chatId) {
    if (!chatId || chatId === currentChatId) return;
    
    currentChatId = chatId;
    const chatDiv = document.getElementById("chat");
    
    // Show loading
    chatDiv.innerHTML = '<div class="loading">Loading chat...</div>';
    
    try {
        const snapshot = await db.collection("chats")
            .doc(chatId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .get();
        
        chatDiv.innerHTML = "";
        
        if (snapshot.empty) {
            chatDiv.innerHTML = `
                <div id="emptyState" class="empty-state">
                    <h2>Empty Chat</h2>
                    <p>Start a conversation</p>
                </div>`;
        } else {
            snapshot.forEach(doc => {
                const data = doc.data();
                addMessage(data.text, data.sender, false);
            });
            scrollToBottom();
        }
        
        // Update chat list highlight
        loadChatList();
        
    } catch (error) {
        console.error("Error loading chat:", error);
        chatDiv.innerHTML = '<div class="error">Failed to load chat</div>';
    }
}

async function clearCurrentChat() {
    if (!currentChatId || !confirm("Clear all messages in this chat?")) return;
    
    try {
        const snapshot = await db.collection("chats")
            .doc(currentChatId)
            .collection("messages")
            .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        document.getElementById("chat").innerHTML = `
            <div id="emptyState" class="empty-state">
                <h2>Chat Cleared</h2>
                <p>Start a new conversation</p>
            </div>`;
            
        return true;
    } catch (error) {
        console.error("Clear error:", error);
        return false;
    }
}

// ==================== MESSAGE FUNCTIONS ====================
function addMessage(text, sender, saveToDB = true) {
    const chat = document.getElementById("chat");
    const empty = document.getElementById("emptyState");
    
    // Remove empty state
    if (empty) empty.remove();
    
    // Create message element
    const msgDiv = document.createElement("div");
    msgDiv.className = `msg ${sender}`;
    
    // Format message with line breaks
    const formattedText = text.replace(/\n/g, '<br>');
    
    // Add avatar based on sender
    const avatar = sender === 'user' ? '👤' : '🤖';
    const senderName = sender === 'user' ? 'You' : 'FreDo AI';
    
    msgDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 18px;">${avatar}</span>
            <span style="font-weight: 500; font-size: 14px; opacity: 0.9;">${senderName}</span>
        </div>
        <div style="font-size: 16px; line-height: 1.5;">${formattedText}</div>
    `;
    
    chat.appendChild(msgDiv);
    
    // Save to database if needed
    if (saveToDB && currentChatId) {
        saveMessageToDB(text, sender);
    }
    
    // Scroll to bottom
    scrollToBottom();
    
    // Speech for AI messages
    if (sender === 'ai' && voiceMode) {
        speakText(text);
    }
}

async function saveMessageToDB(text, sender) {
    if (!currentChatId) return null;
    
    try {
        const messageData = {
            text: text,
            sender: sender,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Save message
        await db.collection("chats")
            .doc(currentChatId)
            .collection("messages")
            .add(messageData);
        
        // Update chat's updatedAt and title if first message
        if (sender === 'user') {
            const chatRef = db.collection("chats").doc(currentChatId);
            const chatDoc = await chatRef.get();
            
            if (chatDoc.exists) {
                const chatData = chatDoc.data();
                const updates = {
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Set title from first user message if still default
                if (!chatData.title || chatData.title === "New Chat") {
                    updates.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
                }
                
                await chatRef.update(updates);
                loadChatList(); // Refresh sidebar
            }
        }
        
        return true;
    } catch (error) {
        console.error("Save message error:", error);
        return false;
    }
}

// ==================== AI BRAIN ====================
async function getFreDoReply(userMessage) {
    const message = userMessage.toLowerCase().trim();
    const original = userMessage.trim();
    
    // 🔐 ADMIN COMMANDS
    if (message.startsWith("admin:")) {
        const cmd = message.substring(6).trim();
        
        if (cmd === "reset memory") {
            await clearUserMemory();
            return "✅ User memory has been reset.";
        }
        
        if (cmd === "reset knowledge") {
            await clearKnowledge();
            return "✅ Learned knowledge cleared.";
        }
        
        if (cmd === "reset chat") {
            const result = await clearCurrentChat();
            return result ? "✅ Chat cleared." : "❌ Failed to clear chat.";
        }
        
        if (cmd === "export chat") {
            exportChat();
            return "📤 Chat exported to file.";
        }
        
        if (cmd === "help") {
            return `Admin Commands:
• admin:reset memory - Clear user data
• admin:reset knowledge - Clear learned facts
• admin:reset chat - Clear current chat
• admin:export chat - Export chat
• admin:help - Show this help`;
        }
        
        return "❌ Unknown admin command. Type 'admin:help' for list.";
    }
    
    // 🧠 LEARNED KNOWLEDGE
    const learned = await findKnowledge(message);
    if (learned) {
        return `🧠 I remember:\n${learned}`;
    }
    
    // 👤 SET NAME
    if (message.startsWith("my name is ")) {
        const name = original.substring(11).trim();
        if (name) {
            await saveUserData("name", name);
            return `Nice to meet you, ${name}! 😊 How can I help you today?`;
        }
    }
    
    // 📚 TEACH ME
    if (message.startsWith("remember this ")) {
        const parts = original.substring(13).split("=>");
        if (parts.length === 2) {
            const question = parts[0].trim();
            const answer = parts[1].trim();
            if (question && answer) {
                await saveKnowledge(question, answer);
                return "✅ Got it! I'll remember that.";
            }
        }
        return "Please use: remember this [question] => [answer]";
    }
    
    // 🏷️ SET FAVORITE
    if (message.includes("i like ")) {
        if (message.includes("coding") || message.includes("programming")) {
            await saveUserData("favorite", "coding");
            return "Awesome! Coding is a great skill. Ask me anything about programming! 💻";
        }
        if (message.includes("math")) {
            await saveUserData("favorite", "math");
            return "Math is fascinating! I can help with derivatives, integrals, and more! 📐";
        }
        if (message.includes("science")) {
            await saveUserData("favorite", "science");
            return "Science rules! Physics, Chemistry, Biology - ask me anything! 🔬";
        }
    }
    
    // 👋 GREETINGS
    if (/(hi|hello|hey|good morning|good afternoon)/i.test(message)) {
        const userData = await getUserData();
        if (userData.name) {
            return `Hello ${userData.name}! 👋 How can I help you today?`;
        }
        return "Hello! 👋 I'm FreDo AI, your learning assistant. What would you like to learn?";
    }
    
    // 🙏 THANKS
    if (message.includes("thank")) {
        return "You're welcome! 😊 Is there anything else I can help with?";
    }
    
    // 📘 MATHS
    if (message.includes("derivative")) {
        return "📘 The derivative measures how a function changes as its input changes.\nExample: d(x²)/dx = 2x\nIt's used to find slopes of curves.";
    }
    
    if (message.includes("integral")) {
        return "📘 Integration is the reverse of differentiation.\nExample: ∫2x dx = x² + C\nIt's used to find areas under curves.";
    }
    
    if (message.includes("algebra")) {
        return "📘 Algebra deals with symbols and rules for manipulating them to solve equations.\nExample: 2x + 3 = 7 → x = 2";
    }
    
    // 💻 PROGRAMMING
    if (message.includes("python")) {
        return "💻 Python is a high-level programming language known for its readability.\nUsed for: AI/ML, web development, automation, data science.";
    }
    
    if (message.includes("javascript")) {
        return "💻 JavaScript makes web pages interactive.\nUsed for: frontend web development, mobile apps, servers (Node.js).";
    }
    
    if (message.includes("html")) {
        return "💻 HTML structures web page content.\nExample: <h1>Title</h1>, <p>Paragraph</p>";
    }
    
    // 🔬 SCIENCE
    if (message.includes("physics")) {
        return "🔬 Physics studies matter, energy, and their interactions.\nTopics: motion, forces, energy, electricity, magnetism.";
    }
    
    if (message.includes("chemistry")) {
        return "🔬 Chemistry studies substances and their transformations.\nTopics: elements, compounds, reactions, bonds.";
    }
    
    if (message.includes("biology")) {
        return "🔬 Biology studies living organisms.\nTopics: cells, genetics, evolution, ecosystems.";
    }
    
    // ❓ DEFAULT RESPONSE
    if (message.endsWith("?")) {
        const subjects = ["math", "science", "coding", "physics", "chemistry"];
        const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
        return `I'm still learning about this topic. \n\nTry asking about:\n• What is ${randomSubject}?\n• Explain derivatives\n• How does Python work?\n\nOr teach me: "remember this [question] => [answer]"`;
    }
    
    return "🤖 I'm here to help you learn! Try asking questions about math, science, or programming. You can also teach me new things!";
}

// ==================== KNOWLEDGE BASE ====================
async function saveKnowledge(question, answer) {
    try {
        await db.collection("knowledge").add({
            question: question.toLowerCase(),
            answer: answer,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Save knowledge error:", error);
        return false;
    }
}

async function findKnowledge(message) {
    try {
        const snapshot = await db.collection("knowledge").get();
        const lowerMsg = message.toLowerCase();
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (lowerMsg.includes(data.question.toLowerCase())) {
                return data.answer;
            }
        }
        return null;
    } catch (error) {
        console.error("Find knowledge error:", error);
        return null;
    }
}

async function clearKnowledge() {
    try {
        const snapshot = await db.collection("knowledge").get();
        const batch = db.batch();
        
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        return true;
    } catch (error) {
        console.error("Clear knowledge error:", error);
        return false;
    }
}

// ==================== USER DATA ====================
async function saveUserData(key, value) {
    try {
        await db.collection("users").doc("default").set({
            [key]: value,
            updated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Save user data error:", error);
        return false;
    }
}

async function getUserData() {
    try {
        const doc = await db.collection("users").doc("default").get();
        return doc.exists ? doc.data() : {};
    } catch (error) {
        console.error("Get user data error:", error);
        return {};
    }
}

async function clearUserMemory() {
    try {
        await db.collection("users").doc("default").delete();
        return true;
    } catch (error) {
        console.error("Clear memory error:", error);
        return false;
    }
}

// ==================== UI FUNCTIONS ====================
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    const menuBtn = document.querySelector('.menu-btn');
    
    isSidebarOpen = !isSidebarOpen;
    
    if (isSidebarOpen) {
        sidebar.classList.add("open");
        overlay.classList.add("show");
        menuBtn.style.opacity = "0";
        menuBtn.style.pointerEvents = "none";
        loadChatList(); // Refresh list when opened
    } else {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
        menuBtn.style.opacity = "1";
        menuBtn.style.pointerEvents = "all";
    }
}

async function sendMessage() {
    const input = document.getElementById("userInput");
    const message = input.value.trim();
    
    if (!message) return;
    
    // Create chat if none exists
    if (!currentChatId) {
        await createNewChat();
        if (!currentChatId) return;
    }
    
    // Add user message
    addMessage(message, "user");
    input.value = "";
    
    // Show typing indicator
    const chat = document.getElementById("chat");
    const typingDiv = document.createElement("div");
    typingDiv.className = "msg ai typing";
    typingDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 18px;">🤖</span>
            <span style="font-weight: 500; font-size: 14px; opacity: 0.9;">FreDo AI</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; padding: 8px 0;">
            <span></span><span></span><span></span>
        </div>
    `;
    chat.appendChild(typingDiv);
    scrollToBottom();
    
    // Get AI response
    setTimeout(async () => {
        try {
            const reply = await getFreDoReply(message);
            typingDiv.remove();
            addMessage(reply, "ai");
        } catch (error) {
            console.error("AI Error:", error);
            typingDiv.remove();
            addMessage("Sorry, I encountered an error. Please try again.", "ai");
        }
    }, 800);
}

function startVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Voice input not supported in your browser.");
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.start();
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById("userInput").value = transcript;
        voiceMode = true;
        
        // Auto-send after delay
        setTimeout(() => {
            sendMessage();
            voiceMode = false;
        }, 500);
    };
    
    recognition.onerror = (event) => {
        console.error("Voice error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Please allow microphone access.");
        }
    };
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    utterance.onend = () => {
        voiceMode = false;
    };
    
    window.speechSynthesis.speak(utterance);
}

function scrollToBottom() {
    const chat = document.getElementById("chat");
    setTimeout(() => {
        chat.scrollTop = chat.scrollHeight;
    }, 100);
}

function formatChatDate(date) {
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 hour
    if (diff < 3600000) {
        return Math.floor(diff / 60000) + "m ago";
    }
    
    // Today
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }
    
    // Within last week
    if (diff < 604800000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Older
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function exportChat() {
    if (!currentChatId) {
        alert("No chat to export");
        return;
    }
    
    try {
        const snapshot = await db.collection("chats")
            .doc(currentChatId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .get();
        
        let text = "=== FreDo AI Chat Export ===\n\n";
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const sender = data.sender === 'user' ? 'You' : 'FreDo AI';
            const time = data.timestamp?.toDate()?.toLocaleString() || new Date().toLocaleString();
            text += `[${time}] ${sender}:\n${data.text}\n\n`;
        });
        
        // Create download
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fredo_chat_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error("Export error:", error);
        alert("Failed to export chat");
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize
        await loadChatList();
        
        // Load last chat or create new
        const snapshot = await db.collection("chats")
            .orderBy("updatedAt", "desc")
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            await createNewChat();
        } else {
            const lastChat = snapshot.docs[0];
            await loadChat(lastChat.id);
        }
        
        // Setup input event listeners
        const input = document.getElementById("userInput");
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Focus input
        input.focus();
        
        console.log("FreDo AI initialized successfully!");
        
    } catch (error) {
        console.error("Initialization error:", error);
        document.getElementById("chat").innerHTML = `
            <div class="error">
                <h2>Connection Error</h2>
                <p>Please check your internet connection</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px;">Retry</button>
            </div>`;
    }
});
// Track users
async function trackUser() {
    try {
        const db = firebase.firestore();
        await db.collection('analytics').add({
            userAgent: navigator.userAgent,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            url: window.location.href
        });
    } catch (error) {
        console.log("Analytics disabled");
    }
}
