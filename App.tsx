import React, { useState, useEffect, useCallback } from 'react';
import { 
  CURRENT_USER, 
  Pin,
  MOCK_CONVERSATIONS
} from './data/mockData';
import { fetchLivePhotos } from './services/photoApi';
import { useLocalPhotos } from './services/useLocalPhotos';
import { usePinsDB } from './hooks/usePinsDB';
import { useAuth } from './hooks/useAuth';
import { isSupabaseReady } from './lib/supabase';
import { DesktopHeader } from './components/DesktopHeader';
import { PinCard } from './components/PinCard';
import { PinDetailModal } from './components/PinDetailModal';
import { CreatePinModal } from './components/CreatePinModal';
import { AuthModal } from './components/AuthModal';
import { UserMenu } from './components/UserMenu';
import { BoardsView } from './components/BoardsView';
import { MessagesView } from './components/MessagesView';
import { Sparkles, Loader2, ArrowDown, FolderOpen, Database } from 'lucide-react';


export function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const {
    pins,
    setPins,
    isDBLoading,
    dbError,
    handleLike: dbHandleLike,
    handleSave: dbHandleSave,
    handleAddComment: dbHandleAddComment,
    handlePublishPin: dbHandlePublishPin,
  } = usePinsDB();

  const [currentTab, setCurrentTab] = useState<'home' | 'boards' | 'messages'>('home');
  const [searchQuery, setSearchQuery] = useState("");
  const [apiPhotos, setApiPhotos] = useState<Pin[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Greet user after sign-in
  useEffect(() => {
    if (user && !authLoading) {
      const name = (user.user_metadata?.full_name as string)?.split(' ')[0] || 'there';
      showToast(`Welcome back, ${name}! 🎉`);
    }
  }, [user?.id]);

  // Local folder photo watcher — polls /api/local-photos every 3s
  const { localPins, count: localCount, lastUpdated: localUpdated } = useLocalPhotos(3000);

  // Sync user saved pins to localStorage (hook also does this, belt-and-suspenders)
  useEffect(() => {
    localStorage.setItem('partage_pins', JSON.stringify(pins));
  }, [pins]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => { setToast(null); }, 2800);
  };

  // Fetch live photos from API on mount & on search change
  const loadPhotos = useCallback(async (query: string, pageNum: number, isNewSearch: boolean = false) => {
    setIsLoading(true);
    try {
      const newPhotos = await fetchLivePhotos(query, pageNum, 20);
      if (isNewSearch) {
        setApiPhotos(newPhotos);
      } else {
        setApiPhotos((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          return [...prev, ...newPhotos.filter(p => !existingIds.has(p.id))];
        });
      }
    } catch (err) {
      console.error("API error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadPhotos("", 1, true); }, [loadPhotos]);

  useEffect(() => {
    const timeout = setTimeout(() => { setPage(1); loadPhotos(searchQuery, 1, true); }, 450);
    return () => clearTimeout(timeout);
  }, [searchQuery, loadPhotos]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPhotos(searchQuery, nextPage, false);
  };

  // ── Like — delegates to DB hook, also updates API photos optimistically ──
  const handleLike = (pinId: string) => {
    dbHandleLike(pinId);
    setApiPhotos(prev => prev.map(p => {
      if (p.id !== pinId) return p;
      const isLiked = !p.isLiked;
      return { ...p, isLiked, likes: isLiked ? p.likes + 1 : Math.max(0, p.likes - 1) };
    }));
  };

  // ── Save — delegates to DB hook, handles API-sourced pins ───────────────
  const handleSave = (pinId: string) => {
    const apiTarget = apiPhotos.find(p => p.id === pinId);
    const existing = pins.find(p => p.id === pinId);

    if (existing) {
      dbHandleSave(pinId);
      showToast(existing.isSaved ? "Removed from saved pins" : "Saved to your board! 📌");
    } else if (apiTarget) {
      const savedPin = { ...apiTarget, isSaved: true };
      setPins(prev => [savedPin, ...prev]);
      dbHandleSave(pinId);
      showToast("Saved to your board! 📌");
    }
    setApiPhotos(prev => prev.map(p => p.id === pinId ? { ...p, isSaved: !p.isSaved } : p));
  };

  // ── Comment ─────────────────────────────────────────────────────────────
  const handleAddComment = (pinId: string, text: string) => {
    dbHandleAddComment(pinId, text, CURRENT_USER.name, CURRENT_USER.avatar, setSelectedPin);
    setApiPhotos(prev => prev.map(p => {
      if (p.id !== pinId) return p;
      const c = { id: `c-${Date.now()}`, author: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text, timestamp: 'Just now', likes: 0 };
      return { ...p, commentsCount: p.commentsCount + 1, comments: [c, ...p.comments] };
    }));
    showToast("Comment posted! 💬");
  };

  // ── Create Pin ───────────────────────────────────────────────────────────
  const handlePublishPin = async (newPinData: Partial<Pin>) => {
    await dbHandlePublishPin(newPinData);
    showToast("Pin published to Partage! 📸✨");
    setCurrentTab('home');
  };


  // Combined Pins: User creations & Reference pins + Live API photos
  const baseLocalPins = searchQuery.trim()
    ? pins.filter(p => 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : pins;

  // Merge: local folder photos (top) → user pins → API photos (deduped)
  const combinedPins = [
    // 1. Local folder photos (always first — newest uploads on top)
    ...localPins.filter(lp =>
      !searchQuery || lp.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    // 2. User/mock pins
    ...baseLocalPins.filter(p => !localPins.some(lp => lp.id === p.id)),
    // 3. API photos
    ...apiPhotos.filter(apiP =>
      !baseLocalPins.some(lp => lp.id === apiP.id) &&
      !localPins.some(lp => lp.id === apiP.id)
    )
  ];

  const savedPins = pins.filter((p) => p.isSaved);


  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Toast Feedback Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 bg-gray-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
          <Sparkles className="w-4 h-4 text-[#FF1493]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Header */}
      <DesktopHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenExplore={() => { setSearchQuery(""); setCurrentTab('home'); }}
        onOpenSaved={() => setCurrentTab('boards')}
        onOpenMessages={() => setCurrentTab('messages')}
        unreadMessages={MOCK_CONVERSATIONS.reduce((s, c) => s + c.unreadCount, 0)}
        onShowToast={showToast}
        user={user}
        authLoading={authLoading}
        onSignIn={() => setAuthModalOpen(true)}
        onSignOut={signOut}
      />

      {/* Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {currentTab === 'boards' ? (
          /* Profile & Saved Boards View */
          <BoardsView
            savedPins={savedPins}
            onLike={handleLike}
            onSave={handleSave}
            onOpenDetail={(p) => setSelectedPin(p)}
            onShowToast={showToast}
            onOpenCreate={() => setIsCreateOpen(true)}
          />
        ) : currentTab === 'messages' ? (
          /* Artist Messaging / DM View */
          <MessagesView onShowToast={showToast} />
        ) : (
          /* Live Photo API Pinterest Masonry Feed */
          <main className="flex-1 pt-4 pb-20 px-4 md:px-8 max-w-[1920px] mx-auto w-full">
            {/* ── Supabase DB Status Banner ─────────────────────────── */}
            {isSupabaseReady && isDBLoading && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                <Database className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="font-semibold">Connecting to Supabase…</span>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 ml-1" />
              </div>
            )}
            {isSupabaseReady && !isDBLoading && !dbError && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <Database className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-semibold">Supabase connected</span>
                <span className="text-emerald-500">·</span>
                <span className="text-emerald-600">
                  {user ? `Signed in as ${(user.user_metadata?.full_name as string) || user.email} ☁️` : 'Pins, likes & comments persist in the cloud ☁️'}
                </span>
                <span className="ml-auto flex items-center gap-1 text-emerald-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Live
                </span>
              </div>
            )}
            {dbError && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <Database className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="font-semibold">{dbError}</span>
              </div>
            )}

            {/* Local Folder Photos Live Banner */}
            {localCount > 0 && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <FolderOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{localCount} photo{localCount !== 1 ? 's' : ''} from your local folder</span>
                <span className="text-emerald-500">·</span>
                <span className="text-emerald-600">shown at top of feed</span>
                <span className="ml-auto flex items-center gap-1 text-emerald-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Live · checking every 3s
                </span>
              </div>
            )}

            {/* Live Search Status Bar */}
            {searchQuery && (
              <div className="mb-4 flex items-center justify-between text-xs text-gray-500 px-1">
                <span>
                  Showing live API results for <strong className="text-gray-900">"{searchQuery}"</strong> ({combinedPins.length} photos)
                </span>
                {isLoading && (
                  <span className="flex items-center space-x-1.5 text-[#FF1493] font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Fetching live photos...</span>
                  </span>
                )}
              </div>
            )}

            {/* Multi-column Pinterest Masonry Grid */}
            <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-4 [column-fill:_balance]">
              {combinedPins.map((pin) => (
                <PinCard
                  key={pin.id}
                  pin={pin}
                  onLike={handleLike}
                  onSave={handleSave}
                  onOpenDetail={(p) => setSelectedPin(p)}
                  onShowToast={showToast}
                />
              ))}
            </div>

            {/* Loading Indicator or "Load More" Button */}
            <div className="mt-10 flex justify-center items-center">
              {isLoading ? (
                <div className="flex items-center space-x-2 text-xs font-semibold text-gray-500 py-4">
                  <Loader2 className="w-5 h-5 text-[#FF1493] animate-spin" />
                  <span>Loading more photos from API...</span>
                </div>
              ) : (
                <button
                  onClick={handleLoadMore}
                  className="px-6 py-3 rounded-full bg-gray-100 hover:bg-[#FF1493] hover:text-white text-gray-800 text-xs font-bold transition-all shadow-xs hover:shadow-pink-glow flex items-center space-x-2 active:scale-95"
                >
                  <ArrowDown className="w-4 h-4" />
                  <span>Explore More Photos</span>
                </button>
              )}
            </div>
          </main>
        )}
      </div>

      {/* Detail Modal */}
      <PinDetailModal
        pin={selectedPin}
        onClose={() => setSelectedPin(null)}
        onLike={handleLike}
        onSave={handleSave}
        onAddComment={handleAddComment}
        onShowToast={showToast}
        currentUser={user
          ? { name: (user.user_metadata?.full_name as string) || user.email || 'User', avatar: (user.user_metadata?.avatar_url as string) || '' }
          : CURRENT_USER
        }
      />

      {/* Create Pin Modal */}
      <CreatePinModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmitPin={handlePublishPin}
        currentUser={user
          ? { name: (user.user_metadata?.full_name as string) || user.email || 'User', avatar: (user.user_metadata?.avatar_url as string) || '', username: `@${user.email?.split('@')[0] || 'user'}` }
          : CURRENT_USER
        }
      />

      {/* Google Sign-in Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onGoogleSignIn={async () => { setAuthModalOpen(false); await signInWithGoogle(); }}
      />
    </div>
  );
}

export default App;

