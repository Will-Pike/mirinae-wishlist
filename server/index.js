const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database setup with LowDB (JSON file-based database)
const adapter = new FileSync('wishlist.json');
const db = low(adapter);

// Initialize database with default values
db.defaults({ items: [], nextId: 1, adminPassword: 'mirinae2025' }).write();

// API Routes

// Verify admin password
app.post('/api/auth/verify', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = db.get('adminPassword').value();
    
    if (password === adminPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all items
app.get('/api/items', (req, res) => {
  try {
    const items = db.get('items')
      .orderBy(['purchased', 'created_at'], ['asc', 'desc'])
      .value();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new item
app.post('/api/items', (req, res) => {
  try {
    const { title, link, quantity, category, price, secondaryCategory } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const id = db.get('nextId').value();
    const newItem = {
      id,
      title,
      link: link || null,
      quantity: quantity || 1,
      category: category || 'Other',
      price: price || null,
      secondaryCategory: secondaryCategory || null,
      purchased: 0,
      created_at: new Date().toISOString()
    };

    db.get('items')
      .push(newItem)
      .write();

    db.update('nextId', n => n + 1).write();
    
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item quantity
app.patch('/api/items/:id/quantity', (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    db.get('items')
      .find({ id: parseInt(id) })
      .assign({ quantity })
      .write();
    
    const updatedItem = db.get('items')
      .find({ id: parseInt(id) })
      .value();
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark item as purchased (decrease quantity by 1)
app.post('/api/items/:id/purchase', (req, res) => {
  try {
    const { id } = req.params;
    const { purchaserName, purchaserMessage } = req.body;
    
    const item = db.get('items')
      .find({ id: parseInt(id) })
      .value();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    let newQuantity = item.quantity - 1;
    let purchased = item.purchased;

    // Initialize purchasers array if it doesn't exist
    if (!item.purchasers) {
      item.purchasers = [];
    }

    // Add purchaser info
    const purchaserInfo = {
      name: purchaserName || 'Anonymous',
      message: purchaserMessage || '',
      purchasedAt: new Date().toISOString()
    };

    // If quantity reaches 0, mark as fully purchased
    if (newQuantity <= 0) {
      newQuantity = 0;
      purchased = 1;
    }

    db.get('items')
      .find({ id: parseInt(id) })
      .assign({ 
        quantity: newQuantity, 
        purchased,
        purchasers: [...item.purchasers, purchaserInfo]
      })
      .write();
    
    const updatedItem = db.get('items')
      .find({ id: parseInt(id) })
      .value();
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.get('items')
      .remove({ id: parseInt(id) })
      .write();
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
