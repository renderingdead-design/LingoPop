
import React, { useState, useRef, useEffect } from 'react';
import { 
  AppView, 
  LANGUAGES, 
  Language, 
  DictionaryData, 
  SavedEntry, 
  ChatMessage,
  NewsArticle
} from './types';
import { 
  fetchBasicDefinition,
  fetchDetailedInfo,
  generateConceptImage, 
  sendChatMessage, 
  generateStoryFromWords,
  fetchDailyNews
} from './services/geminiService';
import AudioPlayer from './components/AudioPlayer';

// --- Icons ---
const BookIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
const CardsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6" /></svg>;
const NewsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>;

export default function App() {
  // --- State ---
  const [view, setView] = useState<AppView>(AppView.ONBOARDING);
  const [nativeLang, setNativeLang] = useState<Language>(LANGUAGES[0]);
  const [targetLang, setTargetLang] = useState<Language>(LANGUAGES[1]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<DictionaryData | null>(null);
  const [notebook, setNotebook] = useState<SavedEntry[]>([]);
  
  // Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Story Mode State
  const [story, setStory] = useState<string | null>(null);
  const [isStoryLoading, setIsStoryLoading] = useState(false);

  // News State
  const [newsArticle, setNewsArticle] = useState<NewsArticle | null>(null);
  const [isNewsLoading, setIsNewsLoading] = useState(false);

  // Derived State
  const isSaved = currentEntry ? notebook.some(n => n.word === currentEntry.word) : false;
  
  // Get due cards for today (or past due)
  const dueCards = notebook.filter(entry => entry.nextReviewDate <= Date.now());

  // --- Handlers ---

  const handleSearch = async (termOverride?: string) => {
    const term = termOverride || searchQuery;
    if (!term.trim()) return;
    
    // If triggered from another view (like News), update search bar visual
    if (termOverride) setSearchQuery(termOverride);

    // Reset states
    setIsLoading(true);
    // Don't change view if already in SEARCH, but if coming from News, switch to SEARCH
    setView(AppView.SEARCH);
    
    setChatHistory([]); 
    setCurrentEntry(null);
    setStory(null);

    try {
      // 1. FAST: Get basic definition
      const basicData = await fetchBasicDefinition(term, nativeLang.name, targetLang.name);
      setCurrentEntry(basicData); // Show result immediately
      setIsLoading(false); // Stop main spinner

      // 2. BACKGROUND: Get heavy details and image in parallel
      const detailsPromise = fetchDetailedInfo(basicData.word, nativeLang.name, targetLang.name, basicData.definition);
      const imagePromise = generateConceptImage(basicData.word);

      // Handle Details
      detailsPromise.then(details => {
         setCurrentEntry(prev => prev ? { ...prev, ...details } : null);
      });

      // Handle Image
      imagePromise.then(img => {
        if (img) {
          setCurrentEntry(prev => prev ? { ...prev, imageUrl: img } : null);
        }
      });

    } catch (error) {
      console.error(error);
      alert("Oops! Something went wrong searching for that word.");
      setIsLoading(false);
    }
  };

  const handleSaveToNotebook = () => {
    if (!currentEntry) return;

    if (isSaved) {
        // Toggle off
        setNotebook(prev => prev.filter(n => n.word !== currentEntry.word));
        return;
    }

    // Only allow save if full data is loaded to prevent incomplete cards
    if (currentEntry.examples && currentEntry.funUsage) {
      const newEntry: SavedEntry = {
        ...(currentEntry as Required<DictionaryData>),
        id: Date.now().toString(),
        timestamp: Date.now(),
        targetLang: targetLang.name,
        nativeLang: nativeLang.name,
        // SRS Init
        nextReviewDate: Date.now(), // Due immediately so they can study newly added words
        interval: 0,
        easeFactor: 2.5,
        reviewCount: 0
      };
      setNotebook(prev => [newEntry, ...prev]);
    } else {
      alert("Hold on! I'm still writing the examples. Try again in a second.");
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentEntry) return;
    const msg = chatInput;
    setChatInput('');
    const newHistory = [...chatHistory, { role: 'user' as const, text: msg }];
    setChatHistory(newHistory);
    setIsChatLoading(true);

    try {
      const response = await sendChatMessage(newHistory, currentEntry.word, msg, targetLang.name);
      setChatHistory([...newHistory, { role: 'model' as const, text: response }]);
    } catch (e) {
        console.error(e);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateStory = async () => {
    if (notebook.length < 2) {
        alert("Save at least 2 words to generate a story!");
        return;
    }
    setIsStoryLoading(true);
    setStory(null);
    try {
        const words = notebook.slice(0, 5).map(n => n.word); // Use top 5 recent words
        const storyText = await generateStoryFromWords(words, targetLang.name, nativeLang.name);
        setStory(storyText);
    } catch(e) {
        console.error(e);
        alert("Couldn't write a story right now.");
    } finally {
        setIsStoryLoading(false);
    }
  };

  const handleFetchNews = async () => {
    setIsNewsLoading(true);
    setNewsArticle(null);
    try {
        const article = await fetchDailyNews(targetLang.name, nativeLang.name);
        setNewsArticle(article);
    } catch (e) {
        console.error(e);
        alert("Failed to load news. Try again later!");
    } finally {
        setIsNewsLoading(false);
    }
  };

  const onWordClick = (word: string) => {
      // Clean word (remove punctuation)
      const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
      if (cleanWord.length > 0) {
          handleSearch(cleanWord);
      }
  };

  /**
   * Spaced Repetition Logic (Simplified SM-2)
   * Status: 0=Forgot, 1=Fuzzy, 2=Know
   */
  const handleSRSReview = (cardId: string, status: 'FORGOT' | 'FUZZY' | 'KNOW') => {
      setNotebook(prev => prev.map(card => {
          if (card.id !== cardId) return card;

          let { interval, easeFactor, reviewCount } = card;
          let nextInterval = 1;

          if (status === 'FORGOT') {
              // Reset
              nextInterval = 1; 
              easeFactor = Math.max(1.3, easeFactor - 0.2);
              reviewCount = 0;
          } else if (status === 'FUZZY') {
              // Small increase
              nextInterval = interval === 0 ? 1 : Math.ceil(interval * 1.2);
              easeFactor = Math.max(1.3, easeFactor - 0.15);
              reviewCount += 1;
          } else {
              // KNOW - Standard SRS growth
              if (reviewCount === 0) nextInterval = 1;
              else if (reviewCount === 1) nextInterval = 3; // Jump a bit
              else nextInterval = Math.ceil(interval * easeFactor);
              
              easeFactor = easeFactor + 0.1;
              reviewCount += 1;
          }

          const nextReviewDate = Date.now() + (nextInterval * 24 * 60 * 60 * 1000);

          return {
              ...card,
              interval: nextInterval,
              easeFactor,
              reviewCount,
              nextReviewDate
          };
      }));
  };

  // --- Render Views ---

  if (view === AppView.ONBOARDING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-yellow-200 to-orange-100">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center">
          <h1 className="text-4xl font-bold text-orange-500 mb-2">LingoPop!</h1>
          <p className="text-gray-500 mb-8">Choose your journey.</p>
          
          <div className="space-y-6">
            <div>
              <label className="block text-left text-sm font-bold text-gray-700 mb-2">I speak...</label>
              <select 
                className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 focus:border-orange-500 outline-none appearance-none"
                value={nativeLang.code}
                onChange={(e) => setNativeLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
              </select>
            </div>

            <div className="relative flex justify-center">
                <div className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full p-1 border">⬇️</div>
            </div>

            <div>
              <label className="block text-left text-sm font-bold text-gray-700 mb-2">I want to learn...</label>
              <select 
                className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none appearance-none"
                value={targetLang.code}
                onChange={(e) => setTargetLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[1])}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
              </select>
            </div>

            <button 
              onClick={() => setView(AppView.SEARCH)}
              className="w-full bg-black text-white font-bold py-4 rounded-2xl text-lg hover:scale-105 transition-transform shadow-lg mt-4"
            >
              Let's Go! 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-50 pb-24">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center sticky top-0 bg-yellow-50/90 backdrop-blur z-30">
        <h1 className="text-2xl font-black text-orange-600 tracking-tight cursor-pointer" onClick={() => { setView(AppView.SEARCH); setCurrentEntry(null); setSearchQuery(''); }}>LingoPop</h1>
        <div className="flex gap-2">
            <span className="bg-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">{nativeLang.flag}</span>
            <span className="text-gray-400">→</span>
            <span className="bg-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">{targetLang.flag}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 max-w-2xl mx-auto">
        
        {view === AppView.SEARCH && (
          <div className={`flex flex-col transition-all duration-500 ${currentEntry || isLoading ? 'justify-start pt-2' : 'justify-center pt-20'}`}>
             
             {/* Search Bar - Always Visible */}
             <div className="w-full relative z-20 transition-all duration-300">
                <input 
                    type="text" 
                    placeholder="Type a word or phrase..." 
                    className="w-full p-6 text-xl rounded-3xl border-2 border-transparent focus:border-orange-400 shadow-xl outline-none placeholder-gray-300"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button 
                    onClick={() => handleSearch()}
                    disabled={isLoading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-orange-500 text-white p-3 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {isLoading ? <div className="animate-spin h-6 w-6 border-2 border-white rounded-full border-t-transparent"></div> : <SearchIcon />}
                </button>
             </div>
             
             {/* Results / Content Area */}
             <div className="w-full mt-6">
                
                {isLoading && !currentEntry && (
                  <div className="flex flex-col items-center pt-10">
                       <div className="text-6xl animate-bounce mb-4">🤔</div>
                       <p className="text-xl font-bold text-gray-600">Thinking...</p>
                  </div>
                )}

                {currentEntry && (
                   <div className="space-y-6 animate-fade-in-up">
                      {/* Main Card */}
                      <div className="bg-white rounded-3xl p-6 shadow-xl border-b-4 border-gray-100">
                          <div className="flex justify-between items-start mb-4">
                              <div>
                                  <h2 className="text-4xl font-black text-gray-800 mb-1">{currentEntry.word}</h2>
                                  {currentEntry.pronunciation && <p className="text-gray-400 font-mono text-sm">{currentEntry.pronunciation}</p>}
                              </div>
                              
                              <div className="flex items-center gap-2">
                                  <AudioPlayer text={currentEntry.word} voiceName={targetLang.voiceName} className="bg-orange-100 text-orange-600 p-3 rounded-full hover:bg-orange-200" />
                                  
                                  <button 
                                      onClick={handleSaveToNotebook}
                                      disabled={!isSaved && (!currentEntry.examples || !currentEntry.funUsage)}
                                      className={`p-3 rounded-full transition-all duration-300 ${
                                          isSaved 
                                              ? 'bg-red-50 text-red-500 scale-110' 
                                              : (!currentEntry.examples ? 'bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50')
                                      }`}
                                  >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={isSaved ? 0 : 2} className="w-6 h-6">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                                      </svg>
                                  </button>
                              </div>
                          </div>

                          {/* Image or Loading Skeleton */}
                          <div className="mb-6 rounded-2xl overflow-hidden shadow-inner bg-gray-50 aspect-video flex items-center justify-center">
                               {currentEntry.imageUrl ? (
                                  <img src={currentEntry.imageUrl} alt={currentEntry.word} className="w-full h-full object-contain animate-fade-in" />
                               ) : (
                                  <div className="flex flex-col items-center text-gray-300 animate-pulse">
                                       <span className="text-4xl mb-2">🎨</span>
                                       <span className="text-xs">Sketching...</span>
                                  </div>
                               )}
                          </div>

                          <div className="bg-yellow-100 p-4 rounded-2xl mb-4">
                               <p className="text-lg font-bold text-yellow-900">{currentEntry.definition}</p>
                          </div>

                          {/* Examples Section */}
                          <div className="space-y-3">
                              {currentEntry.examples ? (
                                  currentEntry.examples.map((ex, idx) => (
                                      <div key={idx} className="bg-gray-50 p-3 rounded-xl animate-fade-in">
                                          <div className="flex justify-between items-start">
                                              <p className="text-gray-800 font-medium mb-1">{ex.text}</p>
                                              <AudioPlayer text={ex.text} voiceName={targetLang.voiceName} className="text-gray-400 hover:text-orange-500" />
                                          </div>
                                          <p className="text-gray-500 text-sm">{ex.translation}</p>
                                      </div>
                                  ))
                              ) : (
                                  /* Loading Skeleton for Examples */
                                  <div className="space-y-3 animate-pulse">
                                      <div className="h-16 bg-gray-100 rounded-xl"></div>
                                      <div className="h-16 bg-gray-100 rounded-xl"></div>
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Fun Usage Card with Synonyms/Antonyms */}
                      {currentEntry.funUsage ? (
                          <div className="bg-purple-600 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden animate-fade-in">
                              <div className="relative z-10">
                                  <h3 className="font-bold text-purple-200 text-sm uppercase tracking-wide mb-2">The Vibe Check ✨</h3>
                                  <p className="text-lg leading-relaxed mb-4">{currentEntry.funUsage}</p>

                                  {/* Synonyms & Antonyms */}
                                  {(currentEntry.synonyms?.length || currentEntry.antonyms?.length) && (
                                    <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-purple-500/50">
                                      
                                      {/* Nuance / Difference Explanation */}
                                      {currentEntry.synonymNuance && (
                                        <div className="bg-purple-800/30 p-3 rounded-xl mb-1 border border-purple-500/30">
                                            <p className="text-sm text-purple-100 italic">
                                                💡 {currentEntry.synonymNuance}
                                            </p>
                                        </div>
                                      )}

                                      <div className="flex gap-4">
                                          {currentEntry.synonyms && currentEntry.synonyms.length > 0 && (
                                            <div className="flex-1">
                                                <span className="text-xs font-bold text-purple-300 uppercase block mb-1">Similar</span>
                                                <div className="flex flex-wrap gap-2">
                                                  {currentEntry.synonyms.map(s => (
                                                    <span 
                                                      key={s} 
                                                      className="bg-purple-800/50 px-2 py-1 rounded text-sm hover:bg-purple-700 cursor-pointer transition-colors" 
                                                      onClick={() => handleSearch(s)}
                                                    >
                                                      {s}
                                                    </span>
                                                  ))}
                                                </div>
                                            </div>
                                          )}
                                          {currentEntry.antonyms && currentEntry.antonyms.length > 0 && (
                                            <div className="flex-1">
                                                <span className="text-xs font-bold text-purple-300 uppercase block mb-1">Opposite</span>
                                                <div className="flex flex-wrap gap-2">
                                                  {currentEntry.antonyms.map(a => (
                                                    <span 
                                                      key={a} 
                                                      className="bg-purple-800/50 px-2 py-1 rounded text-sm hover:bg-purple-700 cursor-pointer transition-colors" 
                                                      onClick={() => handleSearch(a)}
                                                    >
                                                      {a}
                                                    </span>
                                                  ))}
                                                </div>
                                            </div>
                                          )}
                                      </div>
                                    </div>
                                  )}
                              </div>
                              <div className="absolute -bottom-10 -right-10 text-9xl opacity-10">😎</div>
                          </div>
                      ) : (
                           <div className="bg-purple-200 rounded-3xl h-32 animate-pulse"></div>
                      )}

                      {/* Etymology Card */}
                      {currentEntry.etymology ? (
                          <div className="bg-emerald-100 text-emerald-900 rounded-3xl p-6 shadow-lg border-2 border-emerald-200 animate-fade-in">
                               <div className="flex items-center gap-2 mb-2">
                                  <span className="text-2xl">🌱</span>
                                  <h3 className="font-bold text-emerald-700 uppercase tracking-wide text-sm">Word Roots</h3>
                               </div>
                               <p className="leading-relaxed italic text-emerald-950">{currentEntry.etymology}</p>
                          </div>
                      ) : (
                          <div className="bg-emerald-50 rounded-3xl h-24 animate-pulse"></div>
                      )}

                      {/* Actions */}
                      <div className="mt-4">
                          <button 
                              onClick={() => setIsChatOpen(true)}
                              className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-gray-900 flex items-center justify-center gap-2"
                          >
                              <span className="text-xl">💬</span> Chat with {currentEntry.word}
                          </button>
                      </div>
                   </div>
                )}

                {!isLoading && !currentEntry && (
                   <div className="mt-12 text-center text-gray-400 animate-fade-in">
                      <p>Try searching for words, phrases, or even whole sentences!</p>
                   </div>
                )}
             </div>
          </div>
        )}

        {view === AppView.NOTEBOOK && (
            <div className="space-y-6">
                <div className="flex justify-between items-end">
                    <h2 className="text-3xl font-black text-gray-800">My Notebook</h2>
                    <button onClick={handleGenerateStory} className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg font-bold">
                         ✨ Make Story
                    </button>
                </div>

                {isStoryLoading && <div className="p-8 text-center text-gray-500 animate-pulse">Writing a masterpiece...</div>}

                {story && (
                    <div className="bg-white border-2 border-purple-200 p-6 rounded-3xl shadow-lg relative">
                        <button onClick={() => setStory(null)} className="absolute top-4 right-4 text-gray-300 hover:text-gray-500">✕</button>
                        <h3 className="font-bold text-purple-600 mb-2">AI Story Time</h3>
                        <div className="whitespace-pre-wrap text-gray-800">{story}</div>
                    </div>
                )}

                <div className="grid gap-4">
                    {notebook.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">Nothing saved yet! Go search something.</div>
                    ) : (
                        notebook.map(entry => (
                            <div key={entry.id} className="bg-white p-4 rounded-2xl shadow-sm flex justify-between items-center border-l-4 border-transparent hover:border-orange-400 transition-all">
                                <div>
                                    <h3 className="font-bold text-xl">{entry.word}</h3>
                                    <p className="text-gray-500 text-sm">{entry.definition}</p>
                                    <p className="text-xs text-gray-400 mt-1">Review in: {entry.nextReviewDate > Date.now() ? Math.ceil((entry.nextReviewDate - Date.now()) / (1000 * 60 * 60 * 24)) + ' days' : 'Today!'}</p>
                                </div>
                                <AudioPlayer text={entry.word} voiceName={targetLang.voiceName} className="text-gray-300 hover:text-orange-500" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {view === AppView.FLASHCARDS && (
            <div className="h-[75vh] flex flex-col items-center justify-center">
                 <h2 className="text-2xl font-black text-gray-800 mb-4 flex items-center gap-2">
                     Daily Review
                     <span className="text-sm bg-orange-100 text-orange-600 px-2 py-1 rounded-lg font-bold">
                        {dueCards.length} due
                     </span>
                 </h2>
                 {dueCards.length === 0 ? (
                     <div className="text-center p-8 bg-white rounded-3xl shadow-lg">
                        <div className="text-6xl mb-4">🎉</div>
                        <h3 className="text-xl font-bold mb-2">All Caught Up!</h3>
                        <p className="text-gray-500">You've reviewed all your words for today.<br/>Come back tomorrow to strengthen your memory!</p>
                     </div>
                 ) : (
                     <FlashcardDeck 
                        card={dueCards[0]} 
                        voiceName={targetLang.voiceName} 
                        onReview={handleSRSReview}
                     />
                 )}
            </div>
        )}

        {view === AppView.NEWS && (
            <div className="pb-10">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black text-gray-800">Daily News</h2>
                    <button 
                        onClick={handleFetchNews} 
                        className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 active:scale-95 transition-all"
                    >
                        {isNewsLoading ? <span className="animate-spin">↻</span> : <span>↻ New Story</span>}
                    </button>
                </div>

                {!newsArticle && !isNewsLoading && (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">📰</div>
                        <p className="text-gray-500 mb-4">Read real-time news in {targetLang.name}.<br/>Click any word to translate it instantly.</p>
                        <button onClick={handleFetchNews} className="bg-orange-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-orange-600">
                            Fetch News
                        </button>
                    </div>
                )}

                {isNewsLoading && (
                    <div className="space-y-6 animate-pulse">
                        <div className="h-8 bg-gray-200 rounded-xl w-3/4"></div>
                        <div className="h-64 bg-white rounded-3xl shadow-sm p-6 space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-full"></div>
                            <div className="h-4 bg-gray-100 rounded w-full"></div>
                            <div className="h-4 bg-gray-100 rounded w-5/6"></div>
                        </div>
                    </div>
                )}

                {newsArticle && (
                    <div className="animate-fade-in-up space-y-6">
                        {/* Article Card */}
                        <div className="bg-white p-6 rounded-3xl shadow-xl border-t-8 border-orange-500">
                            {newsArticle.sourceTitle && (
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                    Source: {newsArticle.sourceTitle}
                                </div>
                            )}
                            <h3 className="text-2xl font-bold text-gray-900 mb-4 font-serif leading-tight">
                                {newsArticle.title}
                            </h3>
                            
                            <div className="text-lg leading-relaxed text-gray-800 font-serif mb-6">
                                <ClickableText text={newsArticle.content} onWordClick={onWordClick} />
                            </div>

                            <div className="flex justify-between items-center border-t pt-4">
                                <AudioPlayer text={newsArticle.content} voiceName={targetLang.voiceName} label="Listen" className="text-orange-600 bg-orange-50 px-4 py-2 rounded-full" />
                                {newsArticle.sourceUrl && (
                                    <a href={newsArticle.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-black underline">
                                        Read Original
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Translation Accordion (Always open for now for simplicity, or styled distinctively) */}
                        <div className="bg-gray-100 p-6 rounded-3xl border border-gray-200">
                            <h4 className="font-bold text-gray-500 text-sm uppercase mb-3">Translation</h4>
                            <p className="text-gray-700 leading-relaxed">
                                {newsArticle.translation}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        )}

      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-6 left-6 right-6 bg-black text-white rounded-full p-2 shadow-2xl flex justify-around items-center max-w-sm mx-auto z-50">
          <NavButton active={view === AppView.SEARCH} onClick={() => setView(AppView.SEARCH)} icon={<SearchIcon />} label="Search" />
          <NavButton active={view === AppView.NEWS} onClick={() => setView(AppView.NEWS)} icon={<NewsIcon />} label="News" />
          <NavButton active={view === AppView.NOTEBOOK} onClick={() => setView(AppView.NOTEBOOK)} icon={<BookIcon />} label="Notebook" />
          <NavButton active={view === AppView.FLASHCARDS} onClick={() => setView(AppView.FLASHCARDS)} icon={<CardsIcon />} label="Learn" />
      </nav>

      {/* Chat Overlay */}
      {isChatOpen && currentEntry && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-md h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">
                <div className="p-4 bg-gray-100 flex justify-between items-center">
                    <h3 className="font-bold">Chat about "{currentEntry.word}"</h3>
                    <button onClick={() => setIsChatOpen(false)} className="bg-gray-300 rounded-full p-1 w-8 h-8">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="flex justify-start">
                        <div className="bg-gray-200 p-3 rounded-2xl rounded-tl-none max-w-[80%]">
                            Hi! Ask me anything about "{currentEntry.word}".
                        </div>
                    </div>
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-black text-white rounded-tr-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && <div className="text-xs text-gray-400 ml-4">AI is typing...</div>}
                </div>
                <div className="p-4 border-t">
                    <div className="flex gap-2">
                        <input 
                            className="flex-1 border rounded-xl px-4 py-2 outline-none focus:border-black"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                            placeholder="Ask a question..."
                        />
                        <button onClick={handleSendChat} className="bg-orange-500 text-white p-2 rounded-xl">
                            ↑
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

// --- Sub Components ---

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button 
        onClick={onClick}
        className={`p-3 rounded-full transition-all duration-300 flex items-center gap-2 ${active ? 'bg-gray-800 text-white px-5' : 'text-gray-400 hover:text-white'}`}
    >
        {icon}
        {active && <span className="text-sm font-bold">{label}</span>}
    </button>
);

const ClickableText = ({ text, onWordClick }: { text: string; onWordClick: (w: string) => void }) => {
    // Split by space but keep punctuation for flow, handling typical sentence structures
    // Simple split: look for spaces
    const words = text.split(' ');
    
    return (
        <span>
            {words.map((chunk, i) => (
                <span 
                    key={i} 
                    className="inline-block hover:bg-yellow-200 hover:text-orange-700 cursor-pointer rounded px-0.5 transition-colors duration-150"
                    onClick={() => onWordClick(chunk)}
                >
                    {chunk}{' '}
                </span>
            ))}
        </span>
    );
};

const FlashcardDeck = ({ 
    card, 
    voiceName, 
    onReview 
}: { 
    card: SavedEntry, 
    voiceName?: string,
    onReview: (id: string, status: 'FORGOT' | 'FUZZY' | 'KNOW') => void
}) => {
    const [flipped, setFlipped] = useState(false);

    // Reset flip state when card changes
    useEffect(() => {
        setFlipped(false);
    }, [card.id]);

    const handleAction = (e: React.MouseEvent, status: 'FORGOT' | 'FUZZY' | 'KNOW') => {
        e.stopPropagation();
        onReview(card.id, status);
    };

    return (
        <div className="w-full max-w-xs perspective-1000 cursor-pointer group" onClick={() => setFlipped(!flipped)}>
            <div className={`relative w-full aspect-[3/4] transition-transform duration-500 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}>
                
                {/* Front */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center justify-between border-4 border-black">
                     <div className="w-full text-right text-xs text-gray-400">Tap to flip</div>
                     <div className="text-center w-full">
                        {card.imageUrl ? (
                             <img src={card.imageUrl} className="w-24 h-24 object-contain mx-auto mb-6" alt="" />
                        ) : (
                            <div className="text-5xl mb-6">🎨</div>
                        )}
                        <h2 className="text-3xl font-black text-gray-900 mb-4">{card.word}</h2>
                        <AudioPlayer text={card.word} voiceName={voiceName} className="bg-gray-100 p-3 rounded-full mx-auto inline-flex" />
                     </div>
                     <div className="w-full text-center text-gray-400 text-xs">Target: {card.targetLang}</div>
                </div>

                {/* Back */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-black rounded-3xl shadow-2xl p-5 flex flex-col justify-between text-white border-4 border-gray-800">
                    <div>
                        <h3 className="text-xl font-bold text-yellow-400 mb-2 text-center">{card.definition}</h3>
                        <div className="space-y-2">
                            {card.examples && card.examples.slice(0,1).map((ex, i) => (
                                <div key={i} className="bg-gray-900 p-2 rounded-xl border border-gray-800">
                                    <p className="font-medium text-base mb-1">"{ex.text}"</p>
                                    <p className="text-gray-400 text-xs">{ex.translation}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <button 
                            onClick={(e) => handleAction(e, 'FORGOT')}
                            className="bg-red-500 hover:bg-red-600 py-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1"
                        >
                            <span className="text-lg">😵</span>
                            Forgot
                        </button>
                        <button 
                            onClick={(e) => handleAction(e, 'FUZZY')}
                            className="bg-yellow-500 hover:bg-yellow-600 py-2 rounded-xl font-bold text-xs text-black flex flex-col items-center gap-1"
                        >
                             <span className="text-lg">🤔</span>
                             Fuzzy
                        </button>
                        <button 
                            onClick={(e) => handleAction(e, 'KNOW')}
                            className="bg-green-500 hover:bg-green-600 py-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1"
                        >
                             <span className="text-lg">😎</span>
                             Know
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
