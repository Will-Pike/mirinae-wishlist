const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const https = require('https');

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

// Migration: Add order field to existing items that don't have it
const itemsWithoutOrder = db.get('items').filter(item => item.order === undefined).value();
if (itemsWithoutOrder.length > 0) {
  itemsWithoutOrder.forEach((item, index) => {
    db.get('items')
      .find({ id: item.id })
      .assign({ order: index })
      .write();
  });
  console.log(`Migrated ${itemsWithoutOrder.length} items to include order field`);
}

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
      .orderBy(['purchased', 'order', 'created_at'], ['asc', 'asc', 'desc'])
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
    // Set order to be the highest current order + 1, or 0 if no items exist
    const maxOrder = db.get('items').map('order').max().value() || -1;
    const newItem = {
      id,
      title,
      link: link || null,
      quantity: quantity || 1,
      category: category || 'Other',
      price: price || null,
      secondaryCategory: secondaryCategory || null,
      purchased: 0,
      order: maxOrder + 1,
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

// Reorder items (MUST come before /api/items/:id route)
app.put('/api/items/reorder', (req, res) => {
  try {
    const { itemIds } = req.body;
    console.log('🔄 Reorder request received with itemIds:', itemIds);
    
    if (!Array.isArray(itemIds)) {
      console.error('❌ itemIds is not an array:', itemIds);
      return res.status(400).json({ error: 'itemIds must be an array' });
    }

    // Update each item's order based on its position in the array
    itemIds.forEach((id, index) => {
      console.log(`Setting item ${id} to order ${index}`);
      db.get('items')
        .find({ id: parseInt(id) })
        .assign({ order: index })
        .write();
    });
    
    // Return the updated items in their new order
    const updatedItems = db.get('items')
      .orderBy(['purchased', 'order', 'created_at'], ['asc', 'asc', 'desc'])
      .value();
    
    console.log('✅ Reorder complete, returning', updatedItems.length, 'items');
    res.json(updatedItems);
  } catch (error) {
    console.error('❌ Error in reorder endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update/Edit item
app.put('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, link, quantity, category, price, secondaryCategory } = req.body;
    
    const item = db.get('items')
      .find({ id: parseInt(id) })
      .value();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updates = {
      title: title !== undefined ? title : item.title,
      link: link !== undefined ? link : item.link,
      quantity: quantity !== undefined ? quantity : item.quantity,
      category: category !== undefined ? category : item.category,
      price: price !== undefined ? price : item.price,
      secondaryCategory: secondaryCategory !== undefined ? secondaryCategory : item.secondaryCategory
    };

    db.get('items')
      .find({ id: parseInt(id) })
      .assign(updates)
      .write();
    
    const updatedItem = db.get('items')
      .find({ id: parseInt(id) })
      .value();
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore purchased item
app.post('/api/items/:id/restore', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.get('items')
      .find({ id: parseInt(id) })
      .value();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get the original quantity from purchasers length + current quantity
    const originalQuantity = (item.purchasers?.length || 0) + item.quantity;

    db.get('items')
      .find({ id: parseInt(id) })
      .assign({ 
        purchased: 0,
        quantity: originalQuantity,
        purchasers: []
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

// Helper to call the Microlink API to extract metadata (handles anti-bot for Amazon etc.)
function fetchMicrolink(url) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false`;
    const req = https.get(apiUrl, {
      headers: { 'User-Agent': 'mirinae-wishlist/1.0' },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Microlink')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Microlink request timed out')); });
  });
}

// Scrape image for an item from its link URL
app.post('/api/items/:id/fetch-image', async (req, res) => {
  try {
    const { id } = req.params;
    const item = db.get('items').find({ id: parseInt(id) }).value();

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.link) return res.status(400).json({ error: 'Item has no link to scrape' });

    const result = await fetchMicrolink(item.link);

    const imageUrl =
      result?.data?.image?.url ||
      result?.data?.logo?.url ||
      null;

    if (!imageUrl) {
      return res.status(404).json({ error: 'No image found for this link. Try setting one manually.' });
    }

    db.get('items').find({ id: parseInt(id) }).assign({ image_url: imageUrl }).write();
    const updatedItem = db.get('items').find({ id: parseInt(id) }).value();
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch image: ${error.message}` });
  }
});

// Manually set or clear the image URL for an item
app.patch('/api/items/:id/image', (req, res) => {
  try {
    const { id } = req.params;
    const { image_url } = req.body;

    const item = db.get('items').find({ id: parseInt(id) }).value();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    db.get('items').find({ id: parseInt(id) }).assign({ image_url: image_url || null }).write();
    const updatedItem = db.get('items').find({ id: parseInt(id) }).value();
    res.json(updatedItem);
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
