// Gemini API key - Replace with your actual API key
const GEMINI_API_KEY = "AIzaSyC0iny6uph2g33bi3UjAPaGJPH-dpri6ys";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
// Dictionary API for pronunciation and additional word data
const DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

// Global variables
let messages = [];
let history = [];
let darkMode = localStorage.getItem("darkMode") === "true";
let dailyWords = [];
let favorites = JSON.parse(localStorage.getItem("vocab_favorites") || "[]");

document.addEventListener("DOMContentLoaded", () => {
  // DOM element references
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const newChatBtn = document.getElementById("new-chat");
  const clearHistoryBtn = document.getElementById("clear-history");
  const historyDiv = document.getElementById("history");
  const emptyState = document.getElementById("empty-state");
  const themeToggle = document.getElementById("theme-toggle");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const exportChatBtn = document.getElementById("export-chat");
  const dailyWordsList = document.getElementById("daily-words-list");
  const wordDetailsModal = document.getElementById("word-details-modal");
  const wordDetailsModalClose = document.getElementById("word-details-modal-close");
  const wordDetailsClose = document.getElementById("word-details-close");
  const pronunciationBtn = document.getElementById("play-pronunciation");
  const pronunciationAudio = document.getElementById("pronunciation-audio");
  const addToFavoritesBtn = document.getElementById("add-to-favorites");

  // Initialize application
  loadHistory();
  loadDailyWords();
  initializeEventListeners();

  // Apply dark mode if previously set
  if (darkMode) {
    document.body.classList.add("dark-theme");
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }

  // Show empty state if no messages initially
  if (messages.length === 0) {
    showEmptyState();
  }

  // Handle URL parameters (e.g. direct word lookup)
  const urlParams = new URLSearchParams(window.location.search);
  const word = urlParams.get("word");
  if (word) {
    hideEmptyState();
    userInput.value = word;
    sendMessage();
  }

  // Initialize event listeners
  function initializeEventListeners() {
    // Basic UI interactions
    sendBtn.addEventListener("click", sendMessage);
    userInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
    newChatBtn.addEventListener("click", startNewChat);
    clearHistoryBtn.addEventListener("click", clearHistory);
    themeToggle.addEventListener("click", toggleDarkMode);
    sidebarToggle.addEventListener("click", toggleSidebar);
    exportChatBtn.addEventListener("click", exportChat);

    // History interactions
    historyDiv.addEventListener("click", (e) => {
      const item = e.target.closest(".history-item");
      if (item) loadHistoryItem(parseInt(item.dataset.index));
    });

    // Modal interactions
    wordDetailsModalClose.addEventListener("click", () => closeWordModal());
    wordDetailsClose.addEventListener("click", () => closeWordModal());
    wordDetailsModal.addEventListener("click", (e) => {
      if (e.target === wordDetailsModal) closeWordModal();
    });
    pronunciationBtn.addEventListener("click", playPronunciation);
    addToFavoritesBtn.addEventListener("click", toggleFavorite);

    // Daily words interactions
    dailyWordsList.addEventListener("click", (e) => {
      const item = e.target.closest(".daily-word-item");
      if (item) {
        const word = item.dataset.word;
        if (word) {
          userInput.value = word;
          sendMessage();
        }
      }
    });

    // Tag click event delegation
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("synonym-tag") ||
          e.target.classList.contains("antonym-tag")) {
        const word = e.target.textContent.trim();
        userInput.value = word;
        sendMessage();
      }
    });

    // Click outside sidebar to close (on mobile)
    document.addEventListener("click", (e) => {
      if (window.innerWidth <= 768 &&
          !sidebar.contains(e.target) &&
          !sidebarToggle.contains(e.target) &&
          sidebar.classList.contains("active")) {
        sidebar.classList.remove("active");
      }
    });

    // Escape key to close modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wordDetailsModal.classList.contains("active")) {
        closeWordModal();
      }
    });
  }
});

// Core functions

// Send message and get response
function sendMessage() {
  const userInput = document.getElementById("user-input");
  const content = userInput.value.trim();

  if (!content) return;

  // Add user message to chat
  addMessage("user", content);

  // Send to API and get response
  getVocabularyResponse(content);

  // Clear input field
  userInput.value = "";
}

// Add a message to the chat
function addMessage(role, content, timestamp = new Date()) {
  hideEmptyState();
  messages.push({ role, content, timestamp });
  renderMessages();

  // Save to history if there's a completed assistant response
  if (role === "assistant" && messages.length >= 2) {
    saveToHistory();
  }
}

// Fetch response from Gemini API
async function getVocabularyResponse(userInput) {
  const chatMessages = document.getElementById("chat-messages");

  // Add typing indicator
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing";
  typingIndicator.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(typingIndicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    // Check if it's a direct word lookup vs a more complex query
    const isSimpleWordLookup = /^[a-zA-Z]+$/.test(userInput.trim());

    if (isSimpleWordLookup) {
      // It's a single word, fetch from dictionary API first
      try {
        const dictResponse = await fetch(`${DICTIONARY_API_URL}${userInput.trim()}`);
        const dictData = await dictResponse.json();

        if (dictData && !dictData.title) {
          // Successfully got dictionary data
          await processWordLookup(userInput.trim(), dictData);
          return;
        }
      } catch (error) {
        console.log("Dictionary API failed, falling back to Gemini");
        // Continue with Gemini if dictionary API fails
      }
    }

    // Construct the prompt for Gemini
    const prompt = `You are a vocabulary assistant. Your task is to help the user learn new words, understand their meanings,
    and improve their vocabulary.

    User query: "${userInput}"

    If the query is a single word:
    1. Provide the definition(s) of the word
    2. Include the part of speech for each definition (noun, verb, adjective, etc.)
    3. Provide 1-3 example sentences for the word
    4. List 3-5 synonyms
    5. List 2-3 antonyms if applicable
    6. Include any interesting etymological information if relevant

    If the query is a question about vocabulary or language:
    1. Provide a clear, educational answer
    2. Include examples if applicable
    3. Be conversational but focus on being educational

    If the user asks for example sentences, provide at least 3 diverse, natural-sounding examples.

    Format your response in plain text with markdown elements for structure.
    Use ** for important terms, * for emphasis, and organize with headings if needed.`;

    // Call Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    // Remove typing indicator
    if (typingIndicator.parentNode === chatMessages) {
      chatMessages.removeChild(typingIndicator);
    }

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0].content) {
      let aiResponse = data.candidates[0].content.parts[0].text;

      // Format the response
      const formattedResponse = formatVocabularyResponse(aiResponse);
      addMessage("assistant", formattedResponse);

      // If it looks like a word definition, try to fetch audio
      if (isSimpleWordLookup) {
        fetchPronunciation(userInput.trim());
      }
    } else {
      throw new Error("No content in API response");
    }

  } catch (error) {
    // Remove typing indicator if error occurs
    if (typingIndicator && typingIndicator.parentNode === chatMessages) {
      chatMessages.removeChild(typingIndicator);
    }

    console.error("Error fetching response:", error);
    addMessage(
      "assistant",
      `Sorry, I encountered an error: ${error.message}. Please try again.`
    );
    showToast("Error getting response", "error");
  }
}

// Process a word lookup with dictionary API data
async function processWordLookup(word, data) {
  try {
    // Remove typing indicator if present
    const typingIndicators = document.querySelectorAll(".typing");
    typingIndicators.forEach(indicator => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });

    const wordData = {
      word: word,
      phonetic: data[0].phonetic || findPhonetic(data[0]),
      audio: findAudioUrl(data[0]),
      meanings: data[0].meanings || [],
      sourceUrls: data[0].sourceUrls || []
    };

    // Store pronunciation URL for the modal
    if (wordData.audio) {
      document.getElementById("pronunciation-audio").src = wordData.audio;
    }

    // Create a formatted response for the chat
    const formattedResponse = createWordResponse(wordData);
    addMessage("assistant", formattedResponse);

    // Prepare data for potential word details modal
    document.getElementById("word-details-modal").dataset.word = word;
    document.getElementById("word-details-title").textContent = word.charAt(0).toUpperCase() + word.slice(1);
    document.getElementById("word-phonetic").textContent = wordData.phonetic || "";

    // Update favorite button status
    updateFavoriteButtonStatus(word);

    // Format and populate the word details modal sections
    populateWordDetailsModal(wordData);

  } catch (error) {
    console.error("Error processing word data:", error);
    // Fall back to Gemini API
    await getGeminiWordDefinition(word);
  }
}

// Get definition from Gemini as fallback
async function getGeminiWordDefinition(word) {
  try {
    const prompt = `Define the word "${word}". Include:
    1. The word's definition(s)
    2. Part of speech for each definition
    3. 2-3 example sentences
    4. 3-5 synonyms
    5. 2-3 antonyms if applicable
    6. Any relevant etymology

    Format as plain text with markdown elements for structure.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0].content) {
      const aiResponse = data.candidates[0].content.parts[0].text;
      const formattedResponse = formatVocabularyResponse(aiResponse);
      addMessage("assistant", formattedResponse);

      // Try to fetch pronunciation anyway
      fetchPronunciation(word);
    } else {
      throw new Error("No content in API response");
    }
  } catch (error) {
    console.error("Gemini fallback failed:", error);
    addMessage(
      "assistant",
      `Sorry, I couldn't find detailed information for "${word}". Please try another word.`
    );
  }
}

// Format the response from the vocabulary assistant
function formatVocabularyResponse(text) {
  // Basic Markdown formatting
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
    .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic
    .replace(/^# (.*$)/gm, "<h3>$1</h3>") // H3 headers
    .replace(/^## (.*$)/gm, "<h4>$1</h4>") // H4 headers
    .replace(/\n/g, "<br>") // Line breaks
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>") // Code blocks
    .replace(/`([^`]+)`/g, "<code>$1</code>"); // Inline code

  // Handle lists - convert markdown lists to HTML
  formatted = formatted.replace(/(?:^|\n)- (.*)/g, "<br>• $1");

  // Highlight the word being defined
  const wordMatch = text.match(/^(\w+)[:\s]/i);
  if (wordMatch) {
    const word = wordMatch[1];
    formatted = formatted.replace(
      new RegExp(`\\b${word}\\b`, "gi"),
      match => `<span style="color: var(--primary-color); font-weight: bold;">${match}</span>`
    );
  }

  // Style sections like "Definition", "Synonyms" etc.
  formatted = formatted.replace(
    /(?:<br>|^)(Definition|Synonyms|Antonyms|Examples|Etymology):/gi,
    '<br><strong style="color: var(--secondary-color); display: block; margin-top: 10px; border-bottom: 1px solid var(--medium-bg); padding-bottom: 3px;">$1:</strong>'
  );

  return `<div class="vocabulary-response">${formatted}</div>`;
}

// Create a well-formatted response from dictionary API data
function createWordResponse(wordData) {
  let response = `<div class="vocabulary-response">`;

  // Word heading with phonetics
  response += `<h3 style="color: var(--secondary-color); display: flex; align-items: center; gap: 10px;">
    ${wordData.word}
    <span style="font-size: 16px; font-weight: normal; color: var(--text-medium); font-style: italic;">${wordData.phonetic || ''}</span>
    ${wordData.audio ? '<i class="fas fa-volume-up" style="font-size: 16px; cursor: pointer; color: var(--primary-color);" onclick="document.getElementById(\'pronunciation-audio\').play()"></i>' : ''}
  </h3>`;

  // View details button
  response += `<div style="text-align: right; margin-bottom: 15px;">
  </div>`;

  // Meanings section
  if (wordData.meanings && wordData.meanings.length > 0) {
    // Group by part of speech
    wordData.meanings.forEach((meaning, index) => {
      const partOfSpeech = meaning.partOfSpeech;

      response += `<strong style="color: var(--secondary-color); display: block; margin-top: ${index > 0 ? '15px' : '5px'}; border-bottom: 1px solid var(--medium-bg); padding-bottom: 3px;">
        ${partOfSpeech.charAt(0).toUpperCase() + partOfSpeech.slice(1)}:
      </strong>`;

      // Definitions
      meaning.definitions.slice(0, 2).forEach((def, i) => {
        response += `<div style="margin: 8px 0 12px 10px;">
          <div>${i + 1}. ${def.definition}</div>`;

        // Example if available
        if (def.example) {
          response += `<div style="margin: 5px 0 0 15px; color: var(--secondary-color); font-style: italic;">
            "${def.example}"
          </div>`;
        }

        response += `</div>`;
      });

      // Synonyms if available
      if (meaning.synonyms && meaning.synonyms.length > 0) {
        response += `<div style="margin-left: 10px;">
          <strong>Synonyms:</strong> `;

        meaning.synonyms.slice(0, 5).forEach((synonym, i) => {
          response += `<span class="synonym-tag" style="cursor: pointer; display: inline-block; margin: 3px; padding: 2px 8px; background-color: rgba(98, 0, 238, 0.1); border-radius: 12px; font-size: 13px; color: var(--primary-color);">
            ${synonym}
          </span>`;
        });

        response += `</div>`;
      }

      // Antonyms if available
      if (meaning.antonyms && meaning.antonyms.length > 0) {
        response += `<div style="margin-left: 10px; margin-top: 5px;">
          <strong>Antonyms:</strong> `;

        meaning.antonyms.slice(0, 3).forEach((antonym, i) => {
          response += `<span class="antonym-tag" style="cursor: pointer; display: inline-block; margin: 3px; padding: 2px 8px; background-color: rgba(255, 152, 0, 0.1); border-radius: 12px; font-size: 13px; color: var(--accent-color);">
            ${antonym}
          </span>`;
        });

        response += `</div>`;
      }
    });
  }

  response += `</div>`;
  return response;
}

// Populate the word details modal with comprehensive information
function populateWordDetailsModal(wordData) {
  // Word meta section
  const metaSection = document.getElementById("word-meta");
  metaSection.innerHTML = '';

  // Add part of speech tags
  const partsOfSpeech = new Set();
  if (wordData.meanings) {
    wordData.meanings.forEach(meaning => {
      if (meaning.partOfSpeech) {
        partsOfSpeech.add(meaning.partOfSpeech);
      }
    });

    partsOfSpeech.forEach(pos => {
      const span = document.createElement("span");
      span.innerHTML = `<i class="fas fa-tag"></i> ${pos}`;
      metaSection.appendChild(span);
    });
  }

  // Add source link if available
  if (wordData.sourceUrls && wordData.sourceUrls.length > 0) {
    const span = document.createElement("span");
    span.innerHTML = `<i class="fas fa-external-link-alt"></i> <a href="${wordData.sourceUrls[0]}" target="_blank">Source</a>`;
    metaSection.appendChild(span);
  }

  // Definitions section
  const definitionsSection = document.getElementById("word-definitions");
  definitionsSection.innerHTML = `<h4><i class="fas fa-book"></i> Definitions</h4>`;

  if (wordData.meanings && wordData.meanings.length > 0) {
    wordData.meanings.forEach(meaning => {
      meaning.definitions.forEach(def => {
        const defItem = document.createElement("div");
        defItem.className = "word-definition-item";

        const posSpan = document.createElement("span");
        posSpan.className = "word-definition-type";
        posSpan.textContent = meaning.partOfSpeech;
        defItem.appendChild(posSpan);

        const defText = document.createElement("div");
        defText.textContent = def.definition;
        defItem.appendChild(defText);

        if (def.example) {
          const example = document.createElement("div");
          example.className = "word-example";
          example.textContent = def.example;
          defItem.appendChild(example);
        }

        definitionsSection.appendChild(defItem);
      });
    });
  } else {
    definitionsSection.innerHTML += "<p>No definitions available</p>";
  }

  // Examples section
  const examplesSection = document.getElementById("word-examples");
  examplesSection.innerHTML = `<h4><i class="fas fa-quote-right"></i> Examples</h4>`;
  let hasExamples = false;

  if (wordData.meanings) {
    wordData.meanings.forEach(meaning => {
      meaning.definitions.forEach(def => {
        if (def.example) {
          hasExamples = true;
          const example = document.createElement("div");
          example.className = "word-example";
          example.textContent = def.example;
          examplesSection.appendChild(example);
        }
      });
    });
  }

  if (!hasExamples) {
    examplesSection.innerHTML += "<p>No examples available</p>";
  }

  // Synonyms section
  const synonymsSection = document.getElementById("word-synonyms");
  synonymsSection.innerHTML = `<h4><i class="fas fa-exchange-alt"></i> Synonyms</h4>`;
  const allSynonyms = new Set();

  if (wordData.meanings) {
    wordData.meanings.forEach(meaning => {
      if (meaning.synonyms && meaning.synonyms.length > 0) {
        meaning.synonyms.forEach(syn => allSynonyms.add(syn));
      }
    });
  }

  if (allSynonyms.size > 0) {
    const synList = document.createElement("div");
    synList.className = "synonym-list";

    allSynonyms.forEach(synonym => {
      const synTag = document.createElement("span");
      synTag.className = "synonym-tag";
      synTag.textContent = synonym;
      synTag.onclick = () => {
        closeWordModal();
        document.getElementById("user-input").value = synonym;
        sendMessage();
      };
      synList.appendChild(synTag);
    });

    synonymsSection.appendChild(synList);
  } else {
    synonymsSection.innerHTML += "<p>No synonyms available</p>";
  }

  // Antonyms section
  const antonymsSection = document.getElementById("word-antonyms");
  antonymsSection.innerHTML = `<h4><i class="fas fa-not-equal"></i> Antonyms</h4>`;
  const allAntonyms = new Set();

  if (wordData.meanings) {
    wordData.meanings.forEach(meaning => {
      if (meaning.antonyms && meaning.antonyms.length > 0) {
        meaning.antonyms.forEach(ant => allAntonyms.add(ant));
      }
    });
  }

  if (allAntonyms.size > 0) {
    const antList = document.createElement("div");
    antList.className = "antonym-list";

    allAntonyms.forEach(antonym => {
      const antTag = document.createElement("span");
      antTag.className = "antonym-tag";
      antTag.textContent = antonym;
      antTag.onclick = () => {
        closeWordModal();
        document.getElementById("user-input").value = antonym;
        sendMessage();
      };
      antList.appendChild(antTag);
    });

    antonymsSection.appendChild(antList);
  } else {
    antonymsSection.innerHTML += "<p>No antonyms available</p>";
  }
}

// Fetch pronunciation audio URL
async function fetchPronunciation(word) {
  try {
    const response = await fetch(`${DICTIONARY_API_URL}${word}`);
    const data = await response.json();

    if (data && !data.title) {
      const audioUrl = findAudioUrl(data[0]);
      if (audioUrl) {
        document.getElementById("pronunciation-audio").src = audioUrl;
        // We don't automatically play here to avoid unwanted audio
      }
    }
  } catch (error) {
    console.log("Could not fetch pronunciation", error);
    // Silently fail - pronunciation is a nice-to-have
  }
}

// Play the pronunciation audio
function playPronunciation() {
  const audio = document.getElementById("pronunciation-audio");
  if (audio.src) {
    audio.play().catch(err => {
      console.error("Audio playback error:", err);
      showToast("Couldn't play pronunciation", "error");
    });
  } else {
    showToast("No pronunciation available", "warning");
  }
}

// Helper function to find phonetic text
function findPhonetic(wordData) {
  // Try to find phonetic text from the data
  if (wordData.phonetic) return wordData.phonetic;

  if (wordData.phonetics && wordData.phonetics.length > 0) {
    for (const phonetic of wordData.phonetics) {
      if (phonetic.text) return phonetic.text;
    }
  }

  return '';
}

// Helper function to find audio URL
function findAudioUrl(wordData) {
  // Try to find an audio file from the data
  if (wordData.phonetics && wordData.phonetics.length > 0) {
    for (const phonetic of wordData.phonetics) {
      if (phonetic.audio) return phonetic.audio;
    }
  }

  return '';
}

// Show the word details modal
function showWordDetailsModal() {
  const modal = document.getElementById("word-details-modal");
  modal.classList.add("active");
}

// Close the word details modal
function closeWordModal() {
  const modal = document.getElementById("word-details-modal");
  modal.classList.remove("active");
}

// Toggle favorite status of a word
function toggleFavorite() {
  const word = document.getElementById("word-details-modal").dataset.word;
  if (!word) return;

  const index = favorites.findIndex(fav => fav.word.toLowerCase() === word.toLowerCase());

  if (index > -1) {
    // Remove from favorites
    favorites.splice(index, 1);
    showToast(`"${word}" removed from favorites`, "info");
    addToFavoritesBtn.innerHTML = '<i class="fas fa-star"></i> Add to Favorites';
  } else {
    // Add to favorites
    favorites.push({
      word,
      date: new Date().toISOString()
    });
    showToast(`"${word}" added to favorites`, "success");
    addToFavoritesBtn.innerHTML = '<i class="fas fa-star" style="color: #FFC107;"></i> Remove from Favorites';
  }

  localStorage.setItem("vocab_favorites", JSON.stringify(favorites));
}

// Update the favorite button status based on current word
function updateFavoriteButtonStatus(word) {
  const isFavorite = favorites.some(fav => fav.word.toLowerCase() === word.toLowerCase());

  if (isFavorite) {
    addToFavoritesBtn.innerHTML = '<i class="fas fa-star" style="color: #FFC107;"></i> Remove from Favorites';
  } else {
    addToFavoritesBtn.innerHTML = '<i class="fas fa-star"></i> Add to Favorites';
  }
}

// Load daily words
async function loadDailyWords() {
  const dailyWordsList = document.getElementById("daily-words-list");

  // Check if we already have today's words stored
  const today = new Date().toDateString();
  const storedData = localStorage.getItem("vocab_daily_words");
  let storedWords = null;

  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.date === today) {
        storedWords = parsed.words;
      }
    } catch (e) {
      console.error("Error parsing stored daily words", e);
    }
  }

  if (storedWords) {
    // Use stored words
    dailyWords = storedWords;
    renderDailyWords();
  } else {
    // Fetch new words
    try {
      const prompt = `Generate 3 interesting, moderately advanced vocabulary words that would be valuable for an English language learner.
      For each word, provide:
      1. The word itself
      2. A brief definition (1-2 sentences)

      Format the response as a plain JSON array with objects containing 'word' and 'definition' properties.
      Example: [{"word":"ephemeral","definition":"Lasting for a very short time; transitory."},...]`;

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 1.0, // Higher temperature for variety
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch daily words");
      }

      const data = await response.json();

      if (data.candidates && data.candidates[0].content) {
        let content = data.candidates[0].content.parts[0].text;

        // Extract JSON if wrapped in backticks
        content = content.replace(/```json\s*([\s\S]*)\s*```/g, '$1');
        content = content.replace(/```\s*([\s\S]*)\s*```/g, '$1');

        dailyWords = JSON.parse(content);

        // Store in localStorage
        localStorage.setItem("vocab_daily_words", JSON.stringify({
          date: today,
          words: dailyWords
        }));

        renderDailyWords();
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Error fetching daily words:", error);
      // Show a fallback with error message
      dailyWordsList.innerHTML = `
        <div style="color: var(--error-color); padding: 10px;">
          <i class="fas fa-exclamation-circle"></i>
          Couldn't load daily words. <a href="#" onclick="loadDailyWords(); return false;">Retry</a>
        </div>
      `;
    }
  }
}

// Render the daily words in the sidebar
function renderDailyWords() {
  const dailyWordsList = document.getElementById("daily-words-list");
  dailyWordsList.innerHTML = "";

  dailyWords.forEach(item => {
    const wordItem = document.createElement("div");
    wordItem.className = "daily-word-item";
    wordItem.dataset.word = item.word;

    const wordText = document.createElement("div");
    wordText.className = "daily-word-text";
    wordText.textContent = item.word;

    const wordDef = document.createElement("div");
    wordDef.style.fontSize = "12px";
    wordDef.style.color = "var(--text-medium)";
    wordDef.style.marginTop = "3px";
    wordDef.textContent = item.definition;

    wordItem.appendChild(wordText);
    wordItem.appendChild(wordDef);
    dailyWordsList.appendChild(wordItem);
  });
}

// UI functions

// Render all messages in the chat window
function renderMessages() {
  const chatMessages = document.getElementById("chat-messages");
  chatMessages.innerHTML = "";

  messages.forEach((msg) => {
    const messageContainer = document.createElement("div");
    messageContainer.className = `message-container message-${msg.role}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const timestamp = new Date(msg.timestamp);
    const timeStr = timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    meta.innerHTML = msg.role === "user"
      ? `<i class="fas fa-user"></i> You <span class="message-time">${timeStr}</span>`
      : `<i class="fas fa-book"></i> <span class="message-time">${timeStr}</span>`;

    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message chat-message-${msg.role}`;
    messageDiv.innerHTML = msg.content;

    messageContainer.appendChild(meta);
    messageContainer.appendChild(messageDiv);
    chatMessages.appendChild(messageContainer);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Render history in the sidebar
function renderHistory() {
  const historyDiv = document.getElementById("history");
  historyDiv.innerHTML = "";

  history.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.index = index;

    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleDateString() + " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
      <i class="fas fa-search"></i>
      <div>
        <span>${item.title.substring(0, 30)}${item.title.length > 30 ? "..." : ""}</span>
        <span class="history-date">${formattedDate}</span>
      </div>
    `;
    historyDiv.appendChild(div);
  });
}

// Hide the initial empty state message
function hideEmptyState() {
  const emptyState = document.getElementById("empty-state");
  if (emptyState) {
    emptyState.style.display = "none";
  }
}

// Shows the initial empty state message
function showEmptyState() {
  const emptyState = document.getElementById("empty-state");
  const chatMessages = document.getElementById("chat-messages");

  if (emptyState) {
    chatMessages.innerHTML = "";
    emptyState.style.display = "flex";
    chatMessages.appendChild(emptyState);
  }
}

// Show a temporary notification toast
function showToast(message, type = "info") {
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "";
  switch (type) {
    case "success":
      icon = '<i class="fas fa-check-circle"></i>';
      break;
    case "error":
      icon = '<i class="fas fa-times-circle"></i>';
      break;
    case "warning":
      icon = '<i class="fas fa-exclamation-triangle"></i>';
      break;
    default:
      icon = '<i class="fas fa-info-circle"></i>';
  }

  toast.innerHTML = `${icon} ${message}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode === document.body) {
      toast.remove();
    }
  }, 3000);
}

// Data management functions

// Save the current chat session to history
function saveToHistory() {
  const userMessage = messages.find((msg) => msg.role === "user");
  const title = userMessage?.content?.substring(0, 50) +
    (userMessage?.content?.length > 50 ? "..." : "") || "Untitled Search";

  const historyItem = {
    id: Date.now(),
    title: title,
    messages: [...messages],
    timestamp: new Date(),
  };

  const exists = history.findIndex((h) => h.id === historyItem.id);
  if (exists > -1) {
    history[exists] = historyItem; // Update existing entry
  } else {
    history.unshift(historyItem); // Add as new entry at the beginning
  }

  // Limit history size to 50 entries
  if (history.length > 50) {
    history = history.slice(0, 50);
  }

  localStorage.setItem("vocab_history", JSON.stringify(history));
  renderHistory();
}

// Load history from localStorage
function loadHistory() {
  const savedHistory = localStorage.getItem("vocab_history");
  if (savedHistory) {
    try {
      history = JSON.parse(savedHistory);
      renderHistory();
    } catch (error) {
      console.error("Error loading history:", error);
      localStorage.removeItem("vocab_history");
    }
  }
}

// Load a specific history item
function loadHistoryItem(index) {
  if (index >= 0 && index < history.length) {
    messages = [...history[index].messages];
    renderMessages();

    // Close sidebar on mobile if open
    if (window.innerWidth <= 768) {
      document.getElementById("sidebar").classList.remove("active");
    }
  }
}

// Start a new chat
function startNewChat() {
  messages = [];
  showEmptyState();

  // Close sidebar on mobile if open
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.remove("active");
  }

  showToast("New vocabulary session started", "info");
}

// Clear history after confirmation
function clearHistory() {
  if (confirm("Are you sure you want to clear all search history? This cannot be undone.")) {
    history = [];
    localStorage.setItem("vocab_history", JSON.stringify(history));
    renderHistory();
    showToast("History cleared", "success");
  }
}

// Toggle dark mode
function toggleDarkMode() {
  darkMode = !darkMode;
  localStorage.setItem("darkMode", darkMode);
  document.body.classList.toggle("dark-theme");

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.innerHTML = darkMode
    ? '<i class="fas fa-sun"></i>'
    : '<i class="fas fa-moon"></i>';
}

// Toggle sidebar visibility on mobile
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
}

// Export the current chat as a text file
function exportChat() {
  if (messages.length === 0) {
    showToast("No vocabulary data to export", "error");
    return;
  }

  let exportText = "Vocabulary Assistant Chat Export\n";
  exportText += "================================\n\n";

  messages.forEach((msg) => {
    const role = msg.role === "user" ? "You" : "Vocabulary Assistant";
    const time = new Date(msg.timestamp).toLocaleString();
    // Strip HTML tags for plain text export
    const content = msg.content.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ");
    exportText += `[${time}] ${role}:\n`;
    exportText += `${content}\n\n`;
  });

  const blob = new Blob([exportText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  a.href = url;
  a.download = `Vocabulary_Export_${date}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Vocabulary data exported successfully", "success");
}

// Add global function to show word modal (for onclick in HTML)
window.showWordDetailsModal = showWordDetailsModal;