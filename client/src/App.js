import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ title: '', link: '', quantity: 1, category: 'Books', price: '', secondaryCategory: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedItemToPurchase, setSelectedItemToPurchase] = useState(null);
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserMessage, setPurchaserMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);

  const API_URL = process.env.NODE_ENV === 'production' 
    ? '/api' 
    : `http://${window.location.hostname}:3001/api`;

  const categories = ['Books', 'Toys', 'Gift Cards', 'Clothes', 'Subscriptions', 'Classes', 'Tickets', 'Cash Gift', 'Other'];
  const secondaryCategories = ['Books', 'Toys', 'Gift Cards', 'Clothes', 'Subscriptions', 'Classes', 'Tickets', 'Other'];

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchItems = async () => {
    try {
      const response = await fetch(`${API_URL}/items`);
      const data = await response.json();
      setItems(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching items:', error);
      setIsLoading(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    
    if (!newItem.title.trim()) {
      alert('Please enter a title');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      
      const data = await response.json();
      setItems([data, ...items]);
      setNewItem({ title: '', link: '', quantity: 1, category: 'Books', price: '', secondaryCategory: '' });
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handlePurchaseClick = (item) => {
    setSelectedItemToPurchase(item);
    setShowPurchaseModal(true);
  };

  const handlePurchaseConfirm = async () => {
    if (!selectedItemToPurchase) return;

    try {
      const response = await fetch(`${API_URL}/items/${selectedItemToPurchase.id}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaserName: purchaserName.trim(),
          purchaserMessage: purchaserMessage.trim()
        })
      });
      
      const updatedItem = await response.json();
      setItems(items.map(item => item.id === selectedItemToPurchase.id ? updatedItem : item));
      
      // Close modal and reset
      setShowPurchaseModal(false);
      setSelectedItemToPurchase(null);
      setPurchaserName('');
      setPurchaserMessage('');
    } catch (error) {
      console.error('Error marking as purchased:', error);
      alert('Error processing purchase. Please try again.');
    }
  };

  const handlePurchaseCancel = () => {
    setShowPurchaseModal(false);
    setSelectedItemToPurchase(null);
    setPurchaserName('');
    setPurchaserMessage('');
  };

  const handleEditClick = (item) => {
    setEditingItem({...item});
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editingItem || !editingItem.title.trim()) {
      alert('Please enter a title');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem)
      });
      
      const updatedItem = await response.json();
      setItems(items.map(item => item.id === updatedItem.id ? updatedItem : item));
      
      setShowEditModal(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error updating item:', error);
      alert('Error updating item. Please try again.');
    }
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditingItem(null);
  };

  const handleRestore = async (id) => {
    if (!window.confirm('Are you sure you want to restore this item and remove all purchase records?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/items/${id}/restore`, {
        method: 'POST'
      });
      
      const updatedItem = await response.json();
      setItems(items.map(item => item.id === id ? updatedItem : item));
    } catch (error) {
      console.error('Error restoring item:', error);
      alert('Error restoring item. Please try again.');
    }
  };

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (e, targetItem) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      return;
    }

    const draggedIndex = items.findIndex(item => item.id === draggedItem.id);
    const targetIndex = items.findIndex(item => item.id === targetItem.id);

    const newItems = [...items];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setItems(newItems);
    setDraggedItem(null);
  };

  const handleTouchStart = (e, item) => {
    if (!isAdmin) return;
    setDraggedItem(item);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
  };

  const handleTouchEnd = (e, targetItem) => {
    if (!draggedItem || !targetItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      return;
    }

    const draggedIndex = items.findIndex(item => item.id === draggedItem.id);
    const targetIndex = items.findIndex(item => item.id === targetItem.id);

    const newItems = [...items];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setItems(newItems);
    setDraggedItem(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await fetch(`${API_URL}/items/${id}`, {
          method: 'DELETE'
        });
        setItems(items.filter(item => item.id !== id));
      } catch (error) {
        console.error('Error deleting item:', error);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsAdmin(true);
        setShowPasswordPrompt(false);
        setPassword('');
      } else {
        alert('Invalid password');
        setPassword('');
      }
    } catch (error) {
      console.error('Error verifying password:', error);
      alert('Error verifying password');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="App">
      <header className="header">
        <div className="header-content">
          <div className="header-text">
            <h1>
              <span 
                className="admin-emoji"
                onClick={() => !isAdmin ? setShowPasswordPrompt(true) : handleLogout()}
                title={isAdmin ? "Logout" : "Admin"}
              >
                {isAdmin ? '🔓' : '💫'}
              </span>
              {' '}Mirinae's Wishlist 🎁
            </h1>
            {/* <p className="subtitle">Help make Mirinae's wishes come true!</p> */}
          </div>
        </div>
      </header>

      {/* Password prompt modal */}
      {showPasswordPrompt && (
        <div className="modal-overlay" onClick={() => setShowPasswordPrompt(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Admin Login</h2>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                autoFocus
              />
              <div className="modal-buttons">
                <button type="submit" className="btn btn-primary">Login</button>
                <button 
                  type="button" 
                  className="btn btn-cancel"
                  onClick={() => {
                    setShowPasswordPrompt(false);
                    setPassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase confirmation modal */}
      {showPurchaseModal && selectedItemToPurchase && (
        <div className="modal-overlay" onClick={handlePurchaseCancel}>
          <div className="modal-content purchase-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🎉 Confirm Purchase</h2>
            <p className="purchase-confirm-text">
              You're about to mark <strong>{selectedItemToPurchase.title}</strong> as purchased!
            </p>
            <div className="purchase-form">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={purchaserName}
                onChange={(e) => setPurchaserName(e.target.value)}
                className="input-field"
              />
              <textarea
                placeholder="Leave a message for Mirinae (optional)"
                value={purchaserMessage}
                onChange={(e) => setPurchaserMessage(e.target.value)}
                className="input-field message-textarea"
                rows="3"
              />
            </div>
            <div className="modal-buttons">
              <button 
                type="button"
                className="btn btn-primary"
                onClick={handlePurchaseConfirm}
              >
                Confirm Purchase
              </button>
              <button 
                type="button" 
                className="btn btn-cancel"
                onClick={handlePurchaseCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit item modal */}
      {showEditModal && editingItem && (
        <div className="modal-overlay" onClick={handleEditCancel}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>✎ Edit Item</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
              <input
                type="text"
                placeholder="Gift name or experience"
                value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                className="input-field"
              />
              <input
                type="url"
                placeholder="Product link (optional)"
                value={editingItem.link || ''}
                onChange={(e) => setEditingItem({ ...editingItem, link: e.target.value })}
                className="input-field"
              />
              <div className="form-row">
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="input-field category-select"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  placeholder="Quantity"
                  value={editingItem.quantity}
                  onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                  className="input-field quantity-input"
                />
              </div>
              
              {editingItem.category === 'Cash Gift' && (
                <div className="cash-gift-fields">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount (e.g., 25.00)"
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                    className="input-field"
                  />
                  <select
                    value={editingItem.secondaryCategory || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, secondaryCategory: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select category for this gift (optional)</option>
                    {secondaryCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="modal-buttons">
                <button type="submit" className="btn btn-primary">Save Changes</button>
                <button 
                  type="button" 
                  className="btn btn-cancel"
                  onClick={handleEditCancel}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="container">
        {isAdmin && (
          <>
            {/* Purchased Items Section */}
            <div className="purchased-items-section">
              <h2>Purchased Items & Messages</h2>
              {items.filter(item => item.purchasers && item.purchasers.length > 0).length === 0 ? (
                <p className="empty-message">No purchases yet.</p>
              ) : (
                <div className="purchased-items-grid">
                  {items
                    .filter(item => item.purchasers && item.purchasers.length > 0)
                    .map((item) => (
                      <div key={item.id} className="purchased-item-card">
                        <div className="purchased-item-header">
                          <div>
                            <h3>{item.title}</h3>
                            <span className={`category-badge ${(item.category || 'Other').toLowerCase().replace(' ', '-')}`}>
                              {item.category || 'Other'}
                            </span>
                          </div>
                          {item.purchased && (
                            <button 
                              onClick={() => handleRestore(item.id)}
                              className="btn btn-restore"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                        <div className="purchasers-list">
                          {item.purchasers.map((purchaser, idx) => (
                            <div key={idx} className="purchaser-info">
                              <div className="purchaser-header">
                                <strong>{purchaser.name}</strong>
                                <span className="purchase-date">
                                  {new Date(purchaser.purchasedAt).toLocaleDateString()}
                                </span>
                              </div>
                              {purchaser.message && (
                                <p className="purchaser-message">"{purchaser.message}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="add-item-form">
              <h2>Add New Item</h2>
          <form onSubmit={handleAddItem}>
            <input
              type="text"
              placeholder="Gift name or experience"
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              className="input-field"
            />
            <input
              type="url"
              placeholder="Product link (optional)"
              value={newItem.link}
              onChange={(e) => setNewItem({ ...newItem, link: e.target.value })}
              className="input-field"
            />
            <div className="form-row">
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="input-field category-select"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="Quantity"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                className="input-field quantity-input"
              />
            </div>
            
            {newItem.category === 'Cash Gift' && (
              <div className="cash-gift-fields">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (e.g., 25.00)"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  className="input-field"
                />
                <select
                  value={newItem.secondaryCategory}
                  onChange={(e) => setNewItem({ ...newItem, secondaryCategory: e.target.value })}
                  className="input-field"
                >
                  <option value="">Select category for this gift (optional)</option>
                  {secondaryCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
            
            <button type="submit" className="btn btn-primary">Add to Wishlist</button>
          </form>
        </div>
          </>
        )}

        <div className="wishlist">
          <div className="wishlist-header">
            <h2>Wishlist Items ({items.filter(item => !item.purchased).length} available)</h2>
            <div className="category-filter">
              <label>Filter: </label>
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="filter-select"
              >
                <option value="All">All Categories</option>
                {categories
                  .filter(cat => items.some(item => item.category === cat))
                  .map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
              </select>
            </div>
          </div>
          
          {items.length === 0 ? (
            <p className="empty-message">No items yet. Add some gifts above!</p>
          ) : (
            <div className="items-grid">
              {items
                .filter(item => selectedCategory === 'All' || item.category === selectedCategory)
                .map((item) => {
                  const totalQuantity = (item.purchasers?.length || 0) + item.quantity;
                  const purchasedCount = item.purchasers?.length || 0;
                  
                  return (
                  <div 
                    key={item.id} 
                    className={`item-card ${item.purchased ? 'purchased' : ''} ${isAdmin ? 'draggable' : ''} ${draggedItem?.id === item.id ? 'dragging' : ''}`}
                    draggable={isAdmin}
                    onDragStart={(e) => isAdmin && handleDragStart(e, item)}
                    onDragOver={(e) => isAdmin && handleDragOver(e)}
                    onDrop={(e) => isAdmin && handleDrop(e, item)}
                    onTouchStart={(e) => handleTouchStart(e, item)}
                    onTouchMove={(e) => isAdmin && handleTouchMove(e)}
                    onTouchEnd={(e) => isAdmin && handleTouchEnd(e, item)}
                  >
                    <div className="item-header">
                      <div className="item-header-left">
                        <div className="category-badges">
                          <span className={`category-badge ${(item.category || 'Other').toLowerCase().replace(' ', '-')}`}>
                            {item.category || 'Other'}
                          </span>
                          {item.category === 'Cash Gift' && item.secondaryCategory && (
                            <span className={`category-badge ${item.secondaryCategory.toLowerCase().replace(' ', '-')}`}>
                              {item.secondaryCategory}
                            </span>
                          )}
                        </div>
                        <h3 className="item-title">{item.title}</h3>
                        {item.category === 'Cash Gift' && item.price && (
                          <div className="price-display">${parseFloat(item.price).toFixed(2)}</div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="admin-controls">
                          <button 
                            onClick={() => handleEditClick(item)}
                            className="btn-edit"
                            title="Edit item"
                          >
                            ✎
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="btn-delete"
                            title="Delete item"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {item.link && (
                      <a 
                        href={item.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="item-link"
                      >
                        View Product →
                      </a>
                    )}
                    
                    <div className="item-footer">
                      <div className="quantity-badge">
                        {item.purchased ? (
                          <span className="status-purchased">✓ All Purchased</span>
                        ) : (
                          <span className="status-available">
                            {purchasedCount} of {totalQuantity} purchased
                          </span>
                        )}
                      </div>
                      
                      {!item.purchased && !isAdmin && (
                        <button 
                          onClick={() => handlePurchaseClick(item)}
                          className="btn btn-secondary"
                        >
                          I bought this!
                        </button>
                      )}
                      
                      {item.purchased && isAdmin && (
                        <button 
                          onClick={() => handleRestore(item.id)}
                          className="btn btn-restore"
                        >
                          Restore Item
                        </button>
                      )}
                    </div>
                  </div>
                )}
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>Made with ❤️ for Mirinae</p>
      </footer>
    </div>
  );
}

export default App;
