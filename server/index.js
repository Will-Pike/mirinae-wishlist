const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { getState, updateState, sortedItems } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasAdminSession(req) {
  const sessionCookie = (req.headers.cookie || '').split('; ')
    .find(cookie => cookie.startsWith('admin_session='));
  if (!sessionCookie) return false;

  const [expiresAt, signature] = sessionCookie.slice('admin_session='.length).split('.');
  if (!expiresAt || !signature || Number(expiresAt) <= Date.now()) return false;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const expected = crypto.createHmac('sha256', password).update(expiresAt).digest('hex');
  return safeEqual(signature, expected);
}

function requireAdmin(req, res, next) {
  if (!hasAdminSession(req)) return res.status(401).json({ error: 'Admin authentication required' });
  next();
}

// API Routes

// Verify admin password
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) return res.status(503).json({ error: 'Admin password is not configured' });
    
    if (safeEqual(password, adminPassword)) {
      const expiresAt = String(Date.now() + 24 * 60 * 60 * 1000);
      const signature = crypto.createHmac('sha256', adminPassword).update(expiresAt).digest('hex');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `admin_session=${expiresAt}.${signature}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=86400${secure}`);
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0');
  res.json({ success: true });
});

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const state = await getState();
    res.json(sortedItems(state.items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new item
app.post('/api/items', requireAdmin, async (req, res) => {
  try {
    const { title, link, quantity, category, price, secondaryCategory } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let newItem;
    await updateState(state => {
      const id = state.nextId || 1;
      const maxOrder = state.items.reduce((maximum, item) => Math.max(maximum, item.order ?? -1), -1);
      const item = {
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
      state.items.push(item);
      state.nextId = id + 1;
      newItem = item;
    });
    
    if (newItem.link) {
      let timeout;
      try {
        const imageUrl = await Promise.race([
          findImageForUrl(newItem.link),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Image lookup timed out')), 8000);
          })
        ]);
        if (imageUrl) {
          await updateState(state => {
            const item = state.items.find(entry => entry.id === newItem.id);
            if (item) item.image_url = imageUrl;
          });
          newItem.image_url = imageUrl;
        }
      } catch (error) {
        console.log(`Auto image fetch failed for item ${newItem.id}:`, error.message);
      } finally {
        clearTimeout(timeout);
      }
    }

    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item quantity
app.patch('/api/items/:id/quantity', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    let updatedItem;
    await updateState(state => {
      updatedItem = state.items.find(item => item.id === parseInt(id, 10));
      if (updatedItem) updatedItem.quantity = quantity;
    });
    if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark item as purchased (decrease quantity by 1)
app.post('/api/items/:id/purchase', async (req, res) => {
  try {
    const { id } = req.params;
    const { purchaserName, purchaserMessage } = req.body;
    
    let updatedItem;
    await updateState(state => {
      updatedItem = state.items.find(item => item.id === parseInt(id, 10));
      if (!updatedItem) return;
      const purchasers = updatedItem.purchasers || [];
      updatedItem.quantity = Math.max(0, (updatedItem.quantity || 0) - 1);
      updatedItem.purchased = updatedItem.quantity === 0 ? 1 : updatedItem.purchased;
      updatedItem.purchasers = [...purchasers, {
        name: purchaserName || 'Anonymous',
        message: purchaserMessage || '',
        purchasedAt: new Date().toISOString()
      }];
    });
    if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reorder items (MUST come before /api/items/:id route)
app.put('/api/items/reorder', requireAdmin, async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds must be an array' });
    }
    await updateState(state => {
      itemIds.forEach((id, index) => {
        const item = state.items.find(entry => entry.id === parseInt(id, 10));
        if (item) item.order = index;
      });
    });
    const state = await getState();
    res.json(sortedItems(state.items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update/Edit item
app.put('/api/items/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, link, quantity, category, price, secondaryCategory } = req.body;
    
    let updatedItem;
    await updateState(state => {
      const item = state.items.find(entry => entry.id === parseInt(id, 10));
      if (!item) return;
      const updates = {
        title: title !== undefined ? title : item.title,
        link: link !== undefined ? link : item.link,
        quantity: quantity !== undefined ? quantity : item.quantity,
        category: category !== undefined ? category : item.category,
        price: price !== undefined ? price : item.price,
        secondaryCategory: secondaryCategory !== undefined ? secondaryCategory : item.secondaryCategory
      };
      Object.assign(item, updates);
      updatedItem = item;
    });

    if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore purchased item
app.post('/api/items/:id/restore', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let updatedItem;
    await updateState(state => {
      updatedItem = state.items.find(item => item.id === parseInt(id, 10));
      if (!updatedItem) return;
      updatedItem.quantity = (updatedItem.purchasers?.length || 0) + updatedItem.quantity;
      updatedItem.purchased = 0;
      updatedItem.purchasers = [];
    });
    if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
    
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
app.delete('/api/items/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await updateState(state => {
      state.items = state.items.filter(item => item.id !== parseInt(id, 10));
    });
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to resolve a URL, following redirects, and return the final URL
function resolveRedirects(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mirinae-wishlist/1.0)' },
      timeout: 10000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        // Handle relative redirects
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume(); // discard body
        return resolve(resolveRedirects(next, redirects + 1));
      }
      res.resume(); // discard body
      resolve(url);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); resolve(url); }); // on timeout, just use what we have
  });
}

// Fetch a URL and return the HTML body (follows redirects, streams response)
function fetchHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchHtml(next, redirects + 1));
      }
      let data = '';
      res.setEncoding('utf8');
      // Only read first 100KB — og:image is always in <head>
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 100000) { req.destroy(); resolve(data); }
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// Extract og:image (or twitter:image) from raw HTML using regex
function extractOgImage(html) {
  const patterns = [
    /meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].startsWith('http')) return match[1];
  }
  return null;
}

// Clean a URL for scraping - strips tracking params, normalises Amazon URLs to /dp/ASIN
function cleanUrlForScraping(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('amazon.')) {
      const asinMatch = parsed.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) return `https://www.amazon.com/dp/${asinMatch[1]}`;
    }
    // For other sites, drop query params (usually tracking noise)
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

// Get an Amazon product image directly from the CDN using the ASIN (no scraping needed)
function getAmazonImageFromAsin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('amazon.')) {
      const asinMatch = parsed.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) return `https://images-na.ssl-images-amazon.com/images/P/${asinMatch[1]}.jpg`;
    }
  } catch (e) {}
  return null;
}

// Core image-finding logic, shared by the endpoint and auto-fetch
async function findImageForUrl(link) {
  const resolvedUrl = await resolveRedirects(link);
  const cleanUrl = cleanUrlForScraping(resolvedUrl);
  console.log(`Finding image: ${link} -> ${cleanUrl}`);

  // Amazon: use CDN directly (instant, no scraping needed)
  const asinImage = getAmazonImageFromAsin(cleanUrl);
  if (asinImage) return asinImage;

  // All other sites: fetch the HTML and extract og:image
  const html = await fetchHtml(cleanUrl);
  const ogImage = extractOgImage(html);
  if (ogImage) return ogImage;

  return null;
}

// Scrape image for an item from its link URL
app.post('/api/items/:id/fetch-image', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const state = await getState();
    const item = state.items.find(entry => entry.id === parseInt(id, 10));

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.link) return res.status(400).json({ error: 'Item has no link to scrape' });

    const imageUrl = await findImageForUrl(item.link);

    if (!imageUrl) {
      return res.status(404).json({ error: 'No image found for this link. Try setting one manually.' });
    }

    let updatedItem;
    await updateState(current => {
      updatedItem = current.items.find(entry => entry.id === parseInt(id, 10));
      if (updatedItem) updatedItem.image_url = imageUrl;
    });
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch image: ${error.message}` });
  }
});

// Manually set or clear the image URL for an item
app.patch('/api/items/:id/image', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url } = req.body;
    let updatedItem;
    await updateState(state => {
      updatedItem = state.items.find(item => item.id === parseInt(id, 10));
      if (updatedItem) updatedItem.image_url = image_url || null;
    });
    if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (require.main === module && process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
