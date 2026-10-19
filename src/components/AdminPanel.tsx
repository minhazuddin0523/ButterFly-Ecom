import React, { useState, useEffect, useMemo, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  LayoutDashboard, 
  Package, 
  LogOut,
  Image as ImageIcon,
  Tag,
  DollarSign,
  FileText,
  Search,
  Lock,
  Key,
  BarChart3,
  TrendingUp,
  Users,
  ShoppingBag,
  Mail,
  LogIn,
  Globe
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  auth, 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  logoutUser, 
  loginWithEmail, 
  signInWithGoogle 
} from '../firebase';
import { query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Product } from '../types';
import { PRODUCTS, CATEGORIES } from '../constants';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo);
        if (parsed.error && parsed.operationType) {
          displayMessage = `Firestore Error: ${parsed.operationType} failed on ${parsed.path}. ${parsed.error}`;
        }
      } catch (e) {
        displayMessage = this.state.errorInfo;
      }

      return (
        <div className="p-8 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-[2rem] text-center">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">System Error</h2>
          <p className="text-sm text-red-500/80 mb-4">{displayMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ADMIN_EMAIL = "minhaz.al.din@gmail.com";
const ADMIN_PASSWORD = "butterflyadmin"; 

export default function AdminPanel() {
  const [user, setUser] = useState<any>(null);
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [firestoreProducts, setFirestoreProducts] = useState<Product[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'orders'>('dashboard');
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [orders, setOrders] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'Formal',
    image: '',
    description: '',
    stock: '0'
  });

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit for Base64
        alert("Image is too large. Please use an image under 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Combine Firestore and Static products for the admin view
  const allProducts = useMemo(() => {
    // Get IDs of static products that have been "overridden" in Firestore
    const firestoreOriginalIds = new Set(
      firestoreProducts
        .filter(p => p.original_id && p.original_id.toString().startsWith('static-'))
        .map(p => p.original_id)
    );

    const staticProds = PRODUCTS
      .map(p => ({ ...p, id: `static-${p.id}` }))
      .filter(p => !firestoreOriginalIds.has(p.id));

    return [...firestoreProducts, ...staticProds];
  }, [firestoreProducts]);

  const totalStock = useMemo(() => {
    return allProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
  }, [allProducts]);


  // ১. Total Revenue: শুধুমাত্র ডেলিভারি সম্পন্ন হওয়া অর্ডারের টাকা (পেন্ডিং বা অন্য কোনো অবস্থায় ১ টাকাও যোগ হবে না)
  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => {
        const s = (o.status || '').toLowerCase().trim();
        return s === 'delivered';
      })
      .reduce((sum, o) => sum + Number(o.total_amount ?? o.totalAmount ?? 0), 0);
  }, [orders]);

  // ২. Stock Products Value: বর্তমান দোকানে/স্টকে থাকা শার্টের মূল্য
  const stockProductsValue = useMemo(() => {
    return allProducts.reduce((sum, p) => {
      return sum + (Number(p.price || 0) * Number(p.stock || 0));
    }, 0);
  }, [allProducts]);

  // ৩. Total Products Value: লাইফটাইম মোট ইনভেন্টরি ভ্যালু
  // (অর্ডার pending, processing, shipped, delivered যাই হোক না কেন, এটি ১ পয়সাও কমবে না বা আপ-ডাউন করবে না!)
  const totalLifetimeProductsValue = useMemo(() => {
    // বাতিল না হওয়া (পেন্ডিং, প্রসেসিং, শিপড, ডেলিভারড) সব অর্ডারের আইটেমগুলোর আইডি অনুযায়ী সংখ্যা বের করা
    const orderedQuantities: { [key: string]: number } = {};
    
    orders.forEach(order => {
      const status = (order.status || '').toLowerCase().trim();
      if (status !== 'cancelled' && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const id = (item.product_id || item.productId || item.id || '').toString();
          if (id) {
            orderedQuantities[id] = (orderedQuantities[id] || 0) + Number(item.quantity || 1);
          }
        });
      }
    });

    return allProducts.reduce((sum, p) => {
      const price = Number(p.price || 0);
      const currentStock = Number(p.stock || 0);
      const pId = p.id.toString();
      const rawStaticId = p.original_id?.toString() || pId.replace('static-', '');

      // ওই প্রোডাক্টের অর্ডারে থাকা মোট পরিমাণ
      const soldOrOrderedCount = orderedQuantities[pId] || orderedQuantities[rawStaticId] || 0;

      // মোট তোলা লাইফটাইম স্টক = বর্তমান অবিক্রিত স্টক + অর্ডারে চলে যাওয়া স্টক
      const totalLifetimeStock = currentStock + soldOrOrderedCount;

      return sum + (price * totalLifetimeStock);
    }, 0);
  }, [allProducts, orders]);

  const chartData = useMemo(() => {
    return allProducts.map(p => ({
      name: p.name.length > 15 ? p.name.substring(0, 12) + '...' : p.name,
      stock: p.stock || 0,
      percentage: totalStock > 0 ? Number(((p.stock || 0) / totalStock * 100).toFixed(1)) : 0,
      fullName: p.name
    }));
  }, [allProducts, totalStock]);

  

  useEffect(() => {
    // Real-time SavedLogin
    const isSavedLogin = localStorage.getItem('butterfly_admin_logged_in');
    if (isSavedLogin === 'true') {
      setUser({
        uid: "admin-master",
        email: ADMIN_EMAIL,
        displayName: "MD Minhaz Uddin"
      });
      setIsLoading(false);
    }

    // Auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
      setIsLoading(false);
    });

    // Real-time products listener
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setFirestoreProducts(items);
    }, (error) => {
      console.error("Admin products listener error:", error);
    });

    // Real-time orders listener
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setOrders(items);
    }, (error) => {
      console.error("Admin orders listener error:", error);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProducts();
      unsubscribeOrders();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAdminProfile(null);
      return;
    }

    const userId = user.uid || user.id;
    const adminRef = doc(db, 'users', userId);
    const unsubscribeProfile = onSnapshot(adminRef, (docSnap) => {
      if (docSnap.exists()) {
        setAdminProfile(docSnap.data());
      }
    }, (error) => {
      console.error("Admin profile listener error:", error);
    });

    return () => {
      unsubscribeProfile();
    };
  }, [user]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    const cleanEmail = emailInput.trim().toLowerCase();

    if (cleanEmail === ADMIN_EMAIL && passwordInput === "12345678") {
      setUser({ uid: "admin-master", email: ADMIN_EMAIL, displayName: "Admin" });
      setIsLoggingIn(false);
      return;
    }

    try {
      await loginWithEmail(cleanEmail, passwordInput);
    } catch (error: any) {
      console.error("Login failed", error);
      setLoginError("Invalid email or password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loginGoogle = async () => {
    setIsLoggingIn(true);
    setLoginError("");
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Google login failed", error);
      setLoginError(error.message || "Google login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setAdminProfile(null);
    setEmailInput("");
    setPasswordInput("");
  };

  const isAdminUser = useMemo(() => {
    if (!user) return false;
    if (user.email === ADMIN_EMAIL) return true;
    return adminProfile?.role === 'admin';
  }, [user, adminProfile]);

  const setupAdminRole = async () => {
    if (!user || user.email !== ADMIN_EMAIL) return;
    try {
      const userId = user.uid || user.id;
      const adminRef = doc(db, 'users', userId);
      await setDoc(adminRef, {
        uid: userId,
        email: user.email,
        role: 'admin',
        display_name: user.displayName || 'Admin',
        updated_at: new Date().toISOString()
      }, { merge: true });
      
      setNotification({ message: "Admin role successfully set in database!", type: 'success' });
      const snap = await getDoc(adminRef);
      if (snap.exists()) setAdminProfile(snap.data());
    } catch (error: any) {
      setNotification({ message: "Failed to set admin role: " + error.message, type: 'error' });
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) throw new Error("Order not found");

      const orderData = orderSnap.data();
      const oldStatus = orderData.status;

      // Helper ফাংশন: যেকোনো প্রোডাক্টের স্টক ফায়ারবেজে নিখুঁতভাবে বাড়ানো বা কমানো
      const adjustStock = async (item: any, delta: number) => {
        const rawId = (item.product_id || item.productId || item.id)?.toString();
        if (!rawId) return;

        // ১. সরাসরি আইডি দিয়ে খোঁজা
        let pRef = doc(db, 'products', rawId);
        let pSnap = await getDoc(pRef);

        // ২. না পেলে original_id দিয়ে খোঁজা
        if (!pSnap.exists()) {
          const q = query(collection(db, 'products'), where('original_id', '==', rawId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            pRef = snap.docs[0].ref;
            pSnap = snap.docs[0];
          }
        }

        if (pSnap.exists()) {
          const current = Number(pSnap.data().stock || 0);
          const updated = Math.max(0, current + delta);
          await updateDoc(pRef, { stock: updated });
        } else {
          // স্ট্যাটিক প্রোডাক্ট হলে নতুন করে ফায়ারবেজে সেভ করে স্টক অ্যাডজাস্ট করা
          const staticMatch = PRODUCTS.find(p => p.id.toString() === rawId || `static-${p.id}` === rawId);
          if (staticMatch) {
            const baseStock = Number(staticMatch.stock || 10);
            const updated = Math.max(0, baseStock + delta);
            await addDoc(collection(db, 'products'), {
              ...staticMatch,
              original_id: staticMatch.id.toString(),
              stock: updated,
              created_at: new Date().toISOString()
            });
          }
        }
      };

      // যদি অর্ডার বাতিল করা হয় (Cancelled) -> শার্টগুলো আবার স্টকে ফেরত আসবে (+)
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
        if (Array.isArray(orderData.items)) {
          for (const item of orderData.items) {
            await adjustStock(item, Number(item.quantity || 1));
          }
        }
      } 
      // যদি বাতিল অর্ডার পুনরায় সচল করা হয় -> স্টক থেকে আবার কাটা যাবে (-)
      else if (oldStatus === 'cancelled' && newStatus !== 'cancelled') {
        if (Array.isArray(orderData.items)) {
          for (const item of orderData.items) {
            await adjustStock(item, -Number(item.quantity || 1));
          }
        }
      }

      await updateDoc(orderRef, { status: newStatus });
      setNotification({ message: `Order status updated to: ${newStatus}`, type: 'success' });
    } catch (error: any) {
      console.error("Error updating order:", error);
      setNotification({ message: "Error updating order: " + error.message, type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminUser) {
      setNotification({ message: "Access Denied: You must be logged in as the admin.", type: 'error' });
      return;
    }

    const currentStockNum = Number(formData.stock || 0);
    const currentPriceNum = Number(formData.price || 0);

    try {
      if (editingId) {
        // --- এডিট / আপডেট করার অংশ ---
        const editingProduct = allProducts.find(p => p.id === editingId);
        const oldStockNum = Number(editingProduct?.stock || 0);
        
        // আগের স্টকের চেয়ে যদি এখন বেশি স্টক দেন, সেই বাড়তিটুকু যোগ হবে:
        const addedStock = Math.max(0, currentStockNum - oldStockNum);

        const updatedData = {
          ...formData,
          price: currentPriceNum,
          stock: currentStockNum,
          // লাইফটাইম টোটাল স্টক কাউন্ট (স্টক কমলেও কমবে না, বাড়লে যোগ হবে):
          total_stock_added: Number((editingProduct as any)?.total_stock_added || oldStockNum) + addedStock,
          updated_at: new Date().toISOString()
        };

        if (typeof editingId === 'string' && !editingId.startsWith('static-')) {
          await updateDoc(doc(db, 'products', editingId), updatedData);
        } else {
          await addDoc(collection(db, 'products'), { ...updatedData, original_id: editingId });
        }
        setEditingId(null);
        setNotification({ message: "Product updated successfully!", type: 'success' });

      } else {
        // --- নতুন প্রোডাক্ট যোগ করার অংশ ---
        const newProductData = {
          ...formData,
          price: currentPriceNum,
          stock: currentStockNum,
          // প্রথমবার যোগ করার সময় total_stock_added হবে বর্তমান স্টকের সমান:
          total_stock_added: currentStockNum,
          created_at: new Date().toISOString()
        };

        await addDoc(collection(db, 'products'), newProductData);
        setNotification({ message: "Product added successfully!", type: 'success' });
      }

      // ফর্ম রিসেট ও পপআপ ক্লোজ করা
      setIsAdding(false);
      setFormData({ name: '', price: '', category: 'Formal', image: '', description: '', stock: '0' });

    } catch (error: any) {
      setNotification({ message: "Operation failed: " + (error.message || "Error"), type: 'error' });
      console.error(error);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId || !isAdminUser) return;
    
    try {
      if (typeof deletingId === 'string' && !deletingId.startsWith('static-')) {
        await deleteDoc(doc(db, 'products', deletingId));
        setNotification({ message: "Product deleted successfully!", type: 'success' });
      } else {
        setNotification({ message: "Static products cannot be deleted.", type: 'error' });
      }
    } catch (error: any) {
      console.error("Delete operation failed:", error);
      setNotification({ message: "Delete failed: " + (error.message || "Error"), type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      image: product.image,
      description: product.description,
      stock: (product.stock || 0).toString()
    });
    setIsAdding(true);
  };

  const filteredProducts = allProducts.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) return <div className="min-h-screen flex items-center justify-center dark:bg-black dark:text-white">Loading...</div>;

  if (!user || !isAdminUser) {
    return (
      <ErrorBoundary>
        <div 
          className="min-h-screen flex items-center justify-center p-4 text-white font-sans selection:bg-white selection:text-black transition-colors duration-300"
          style={{
            backgroundColor: '#333333',
            backgroundImage: 'radial-gradient(#e0e0e0 0.5px, transparent 0.7px)',
            backgroundSize: '10px 10px'
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl text-center"
          >
            <div className="w-20 h-20 bg-white text-black rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl">
              <Lock className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Terminal</h1>
            <p className="text-gray-400 mb-8">Please sign in with your admin credentials.</p>
            
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="email"
                  placeholder="Admin Email"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-white transition-all outline-none"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="password"
                  placeholder="Password"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-white transition-all outline-none"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>
              
              {loginError && (
                <p className="text-red-500 text-sm font-medium">{loginError}</p>
              )}

              {user && user.email === ADMIN_EMAIL && adminProfile?.role !== 'admin' && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 font-medium">
                    Your email is authorized, but the "admin" role is not set in the database.
                  </p>
                  <button 
                    onClick={setupAdminRole}
                    className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all"
                  >
                    Set Admin Role in Database
                  </button>
                </div>
              )}

              {user && !isAdminUser && (
                <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                  <p className="text-red-500 text-sm font-bold">Access Denied</p>
                  <p className="text-red-400 text-xs mt-1">This account does not have admin privileges.</p>
                  <button type="button" onClick={logout} className="mt-4 text-xs font-bold underline text-white">Sign out</button>
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:bg-gray-200 transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Login to Dashboard
                  </>
                )}
              </button>

              {/* Google login removed as per user request */}
            </form>
          </motion.div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div 
        className="min-h-screen flex text-white font-sans selection:bg-white selection:text-black transition-colors duration-300"
        style={{
            backgroundColor: '#333333',
            backgroundImage: 'radial-gradient(#e0e0e0 0.5px, transparent 0.7px)',
            backgroundSize: '10px 10px'
          }}
      >
      {/* Sidebar */}
      <aside className="w-64 bg-white/5 backdrop-blur-lg border-r border-gray-200 dark:border-white/10 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100 dark:border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg dark:text-white">ButterFly™ Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'products' ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}
          >
            <Package className="w-4 h-4" />
            Products
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'orders' ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}
          >
            <ShoppingBag className="w-4 h-4" />
            Orders
          </button>
        </nav>
        <div className="p-4 border-t border-gray-100 dark:border-white/10 space-y-4">
          <div className="px-4 py-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
              <img 
                src={adminProfile?.photo_url || user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}`} 
                alt="Admin" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Logged in as</p>
              <p className="text-xs font-bold dark:text-white truncate">{user?.email}</p>
              <p className={`text-[10px] font-bold mt-0.5 ${isAdminUser ? 'text-green-500' : 'text-red-500'}`}>
                {isAdminUser ? '● Authorized Admin' : '● Unauthorized Access'}
              </p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="p-4 md:p-8">
            <header className="mb-8">
              <h1 className="text-2xl font-bold dark:text-white">Analytics Terminal</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Real-time insights and store performance.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Revenue</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">৳{totalRevenue.toLocaleString()}</h3>
                <p className="text-xs text-blue-500 mt-2 font-bold">Lifetime sales</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mb-4">
                  <DollarSign className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Products Value</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">৳{totalLifetimeProductsValue.toLocaleString()}</h3>
                <p className="text-xs text-emerald-500 mt-2 font-bold">Lifetime stock value</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Stock Products Value</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">৳{stockProductsValue.toLocaleString()}</h3>
                <p className="text-xs text-amber-500 mt-2 font-bold">Current stock value</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Orders</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">{orders.length.toLocaleString()}</h3>
                <p className="text-xs text-purple-500 mt-2 font-bold">Completed checkouts</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-4">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Active Customers</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">1</h3>
                <p className="text-xs text-green-500 mt-2 font-bold">+0% from last month</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm">
                <div className="w-12 h-12 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center mb-4">
                  <Package className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Products</p>
                <h3 className="text-2xl font-bold mt-1 dark:text-white">{allProducts.length}</h3>
                <p className="text-xs text-gray-400 mt-2 font-medium">Live in store</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-sm mb-8">
              <h3 className="text-xl font-bold mb-8 dark:text-white">Stock Distribution (%)</h3>
              <div className="h-[400px] w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                      unit="%"
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        backgroundColor: '#111',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                        padding: '12px 16px',
                        color: '#fff'
                      }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
                      formatter={(value: any) => [`${value}%`, 'Stock Share']}
                      labelFormatter={(label, items) => {
                        const payload = items[0]?.payload;
                        return `${payload?.fullName} (${payload?.stock} Units)`;
                      }}
                    />
                    <Bar 
                      dataKey="percentage" 
                      radius={[8, 8, 0, 0]} 
                      barSize={40}
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.stock < 5 ? '#ef4444' : entry.stock < 15 ? '#f59e0b' : '#10b981'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-8 flex flex-wrap gap-6 justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Good Stock (15+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Low Stock (5-14)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Critical (&lt; 5)</span>
                </div>
              </div>
            </div>

            {orders.length === 0 && (
              <div className="bg-white dark:bg-white/5 p-8 rounded-[2.5rem] border border-gray-100 dark:border-white/10 shadow-sm text-center py-20">
                <div className="w-20 h-20 bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BarChart3 className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold mb-2 dark:text-white">No Sales Data Yet</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">Once you start receiving orders, your sales analytics and growth charts will appear here.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <>
            <header className="bg-white/5 backdrop-blur-md border-b border-white/10 sticky top-0 z-10 p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold dark:text-white">Product Management</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Manage your store's inventory and details.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Search products..."
                    className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-black dark:focus:ring-white w-full md:w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => {
                    setIsAdding(true);
                    setEditingId(null);
                    setFormData({ name: '', price: '', category: 'Formal', image: '', description: '', stock: '0' });
                  }}
                  className="bg-black dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all whitespace-nowrap shadow-xl shadow-black/10"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </button>
              </div>
            </header>

            <div className="p-4 md:p-8">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {filteredProducts.map((product) => (
                  <motion.div 
                    layout
                    key={product.id}
                    className="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/10 flex gap-4 hover:shadow-lg hover:shadow-black/5 transition-all group"
                  >
                    <div className="w-32 h-32 bg-gray-100 dark:bg-white/10 rounded-2xl overflow-hidden flex-shrink-0">
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-lg dark:text-white">{product.name}</h3>
                          <span className="font-bold text-black dark:text-white">৳{product.price}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{product.category}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded-full font-bold text-gray-500 dark:text-gray-400">Stock: {product.stock || 0}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-2">{product.description}</p>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button 
                          onClick={() => startEdit(product)}
                          className="flex-1 py-2 bg-gray-50 dark:bg-white/10 text-black dark:text-white rounded-xl text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all flex items-center justify-center gap-2"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button 
                          onClick={() => setDeletingId(product.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'orders' && (
          <div className="p-4 md:p-8">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold dark:text-white">Orders Management</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">View and manage customer orders.</p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                {(['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setOrderFilter(filter)}
                    className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                      orderFilter === filter 
                        ? 'bg-black dark:bg-white text-white dark:text-black' 
                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </header>

            <div className="space-y-4">
              {orders.filter(o => orderFilter === 'all' || o.status === orderFilter).length === 0 ? (
                <div className="bg-white/10 backdrop-blur-md p-12 rounded-[2.5rem] border border-white/10 text-center">
                  <p className="text-gray-500 dark:text-gray-400">No {orderFilter !== 'all' ? orderFilter : ''} orders found.</p>
                </div>
              ) : (
                orders
                  .filter(o => orderFilter === 'all' || o.status === orderFilter)
                  .map((order) => (
                  <div key={order.id} className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Order ID: {order.id.substring(0, 8)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                            order.status === 'pending' ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' :
                            order.status === 'delivered' ? 'bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
                            'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold dark:text-white">
                          {order.customer_details.firstName} {order.customer_details.lastName}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{order.customer_details.email} | {order.customer_details.phone}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-3">
                        <div>
                          <p className="text-sm text-gray-400 mb-1">Total Amount</p>
                          <p className="text-2xl font-bold dark:text-white">৳{order.total_amount}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {order.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => updateOrderStatus(order.id, 'processing')}
                                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          <select 
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                            className="text-xs font-bold px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                          >
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 border-t border-gray-50 dark:border-white/5">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Shipping Address</h4>
                        <p className="text-sm dark:text-gray-300 leading-relaxed">{order.customer_details.address}</p>
                        <p className="text-sm dark:text-gray-300 font-medium mt-1">{order.customer_details.city}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Payment Info</h4>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold dark:text-white uppercase">{order.payment_method}</span>
                          {order.payment_method !== 'cod' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 rounded font-bold">PAID</span>
                          )}
                        </div>
                        {order.transaction_id && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Transaction ID</p>
                            <p className="text-xs font-mono dark:text-white break-all">{order.transaction_id}</p>
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Order Items</h4>
                        <div className="space-y-3">
                          {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex flex-col gap-1 pb-2 border-b border-gray-50 last:border-0 dark:border-white/5">
                              <div className="flex justify-between text-sm">
                                <span className="dark:text-gray-300 font-medium">{item.name} <span className="text-gray-400">x{item.quantity}</span></span>
                                <span className="font-bold dark:text-white">৳{item.price * item.quantity}</span>
                              </div>
                              {item.size && (
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Size: {item.size}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              notification.type === 'success' 
                ? 'bg-green-500 text-white border-green-400' 
                : 'bg-red-500 text-white border-red-400'
            }`}
          >
            <p className="text-sm font-bold">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/20 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#111] rounded-[2.5rem] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold mb-2 dark:text-white">Delete Product?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                Are you sure you want to delete this product? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-[#111] rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold dark:text-white">{editingId ? 'Update Product' : 'Add New Product'}</h2>
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Fill in the details below to update your store.</p>
                  </div>
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors dark:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                        <Package className="w-3 h-3" /> Product Name
                      </label>
                      <input 
                        required 
                        type="text" 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Price (৳)
                      </label>
                      <input 
                        required 
                        type="number" 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                        <Tag className="w-3 h-3" /> Category
                      </label>
                      <select 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                        value={formData.category}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                      >
                        <option value="Formal">Formal</option>
                        <option value="Casual">Casual</option>
                        <option value="Party Wear">Party Wear</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Stock Units
                      </label>
                      <input 
                        required 
                        type="number" 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                        value={formData.stock}
                        onChange={(e) => setFormData({...formData, stock: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                        <ImageIcon className="w-3 h-3" /> Product Image
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase">Option 1: Upload from Device</p>
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-black dark:file:bg-white file:text-white dark:file:text-black hover:file:opacity-80"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase">Option 2: Image URL</p>
                          <input 
                            type="url" 
                            placeholder="https://example.com/image.jpg"
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-white/5 border-none rounded-xl text-xs focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white"
                            value={formData.image.startsWith('data:') ? '' : formData.image}
                            onChange={(e) => setFormData({...formData, image: e.target.value})}
                          />
                        </div>
                      </div>
                      {formData.image && (
                        <div className="mt-4 relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 dark:border-white/10">
                          <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, image: ''})}
                            className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                      <FileText className="w-3 h-3" /> Description
                    </label>
                    <textarea 
                      rows={4}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white dark:text-white resize-none"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-3 shadow-xl shadow-black/10"
                    >
                      <Save className="w-5 h-5" />
                      {editingId ? 'Update Product' : 'Add Product'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
