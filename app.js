let appData = {
    decks: [],
    folders: [],
    studyLogs: [],
    settings: {
        theme: 'light'
    },
    statistics: {
        daily: {},
        totalCardsStudied: 0,
        totalCorrect: 0,
        totalAttempts: 0
    }
};

let currentStudySession = null;
let currentFolderId = 'root';

let currentDeckId = null;
let currentStudyCards = [];
let currentStudyIndex = 0;
let isReversed = false;
let isAutoPlay = false;
let autoPlayTimer = null;

// DOM Elements
const views = {
    decks: document.getElementById('view-decks'),
    deckDetails: document.getElementById('view-deck-details'),
    study: document.getElementById('view-study'),
    logs: document.getElementById('view-logs')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    loadData();
    // Initialize statistics if missing from old data
    if (!appData.statistics) {
        appData.statistics = { daily: {}, totalCardsStudied: 0, totalCorrect: 0, totalAttempts: 0 };
    }
    if (!appData.folders) appData.folders = [];
    if (!appData.studyLogs) appData.studyLogs = [];
    appData.decks.forEach((d, i) => {
        if (d.parentId === undefined) {
            d.parentId = 'root';
            d.sortIndex = i;
        }
    });
    
    setupEventListeners();
    renderDeckList();
    renderGlobalStats();
    applyTheme(appData.settings.theme);
});

// ==========================================
// 1. Data Management (LocalStorage)
// ==========================================
function saveData() {
    localStorage.setItem('flashpro_data', JSON.stringify(appData));
}

function loadData() {
    const saved = localStorage.getItem('flashpro_data');
    if (saved) {
        try {
            appData = JSON.parse(saved);
        } catch (e) {
            console.error('Data parsing error', e);
        }
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function decodeHtml(html) {
    if (!html) return '';
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

/**
 * [상세 해설] 이하 텍스트를 .detail-section span으로 감싸서
 * 별도 색상·작은 글자로 표시되도록 HTML을 가공합니다.
 */
function formatAnswerHtml(html) {
    if (!html) return '';
    // [상세 해설] 마커 기준으로 분리 (한국어 마커)
    const marker = '[상세 해설]';
    const idx = html.indexOf(marker);
    if (idx === -1) return html;
    const before = html.substring(0, idx);
    const after = html.substring(idx);
    return before + '<span class="detail-section">' + after + '</span>';
}


// ==========================================
// 2. Event Listeners
// ==========================================
function setupEventListeners() {
    // Folders and Logs
    document.getElementById('btnCreateFolder').addEventListener('click', () => openModal('modalCreateFolder'));
    document.getElementById('btnConfirmCreateFolder').addEventListener('click', handleCreateFolder);
    document.getElementById('btnViewLogs').addEventListener('click', () => switchView('logs'));
    document.getElementById('btnConfirmMove').addEventListener('click', handleMoveItem);
    
    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // View Navigation
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => switchView('decks'));
    });

    // Modals
    document.getElementById('btnCreateDeck').addEventListener('click', () => openModal('modalCreateDeck'));
    document.getElementById('btnAddCard').addEventListener('click', () => {
        document.getElementById('editCardId').value = '';
        document.getElementById('cardFrontInput').innerHTML = '';
        document.getElementById('cardBackInput').innerHTML = '';
        document.getElementById('cardReferenceInput').innerHTML = '';
        openModal('modalAddCard');
    });
    
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });

    // Actions
    document.getElementById('btnConfirmCreateDeck').addEventListener('click', handleCreateDeck);
    document.getElementById('btnConfirmAddCard').addEventListener('click', handleAddCard);
    
    // Study
    document.getElementById('btnStudyDeck').addEventListener('click', startStudySession);
    document.getElementById('btnStudyAllDeck').addEventListener('click', () => startStudyAllSession(false));
    document.getElementById('btnStudyRandomDeck').addEventListener('click', () => startStudyAllSession(true));
    document.getElementById('activeFlashcard').addEventListener('click', flipCard);
    document.getElementById('btnShowAnswer').addEventListener('click', showAnswer);
    
    document.querySelectorAll('.srs-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const score = parseInt(e.currentTarget.dataset.score);
            handleSrsAnswer(score);
        });
    });

    document.getElementById('btnToggleReverse').addEventListener('click', toggleReverseMode);
    document.getElementById('btnToggleAutoPlay').addEventListener('click', toggleAutoPlay);
    
    // TTS
    document.querySelector('.tts-front').addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(document.getElementById('cardFrontText').innerText);
    });
    document.querySelector('.tts-back').addEventListener('click', (e) => {
        e.stopPropagation();
        const textToRead = document.getElementById('cardBackText').innerText + " " + document.getElementById('cardReferenceText').innerText.replace('참고 자료:', '');
        speakText(textToRead.trim());
    });

    // CSV & Export/Import
    document.getElementById('csvFileInput').addEventListener('change', handleCsvImport);
    
    document.getElementById('btnExportCsv').addEventListener('click', () => {
        const container = document.getElementById('csvDeckSelection');
        container.innerHTML = '';
        if (appData.decks.length === 0) return container.innerHTML = '<p style="text-align:center;">생성된 덱이 없습니다.</p>';
        appData.decks.forEach(deck => {
            container.innerHTML += `
                <div style="margin-bottom: 8px;">
                    <label style="display:flex; align-items:flex-start; gap: 10px; font-weight: normal; cursor:pointer; color: var(--text-main); text-align: left;">
                        <input type="checkbox" class="csv-deck-cb" value="${deck.id}" checked style="width: 16px; height: 16px; margin-top: 3px; flex-shrink: 0;">
                        <span style="flex: 1; line-height: 1.4; word-break: keep-all; overflow-wrap: break-word;">${deck.name} (${deck.cards.length}장)</span>
                    </label>
                </div>
            `;
        });
        openModal('modalExportCsv');
    });
    document.getElementById('btnConfirmExportCsv').addEventListener('click', handleExportCsvSelected);
    document.getElementById('btnSelectAllDecks').addEventListener('click', () => {
        document.querySelectorAll('.csv-deck-cb').forEach(cb => cb.checked = true);
    });
    document.getElementById('btnDeselectAllDecks').addEventListener('click', () => {
        document.querySelectorAll('.csv-deck-cb').forEach(cb => cb.checked = false);
    });
    
    document.getElementById('btnExportAll').addEventListener('click', handleExportJson);
    document.getElementById('jsonFileInput').addEventListener('change', handleImportJson);
    
    document.getElementById('btnExportPdf').addEventListener('click', () => {
        const deck = appData.decks.find(d => d.id === currentDeckId);
        document.getElementById('pdfFileNameInput').value = deck ? `${deck.name}_flashcards` : 'flashcards';
        openModal('modalExportPdf');
    });
    document.getElementById('btnConfirmExportPdf').addEventListener('click', handleExportPdf);
    document.getElementById('btnEditDeckName').addEventListener('click', handleEditDeckName);
    
    // Bulk Card Selection & Move listeners
    document.getElementById('cbSelectAllCards').addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.card-select-cb').forEach(cb => {
            cb.checked = checked;
        });
        updateSelectedCardsUI();
    });
    document.getElementById('btnMoveSelectedCards').addEventListener('click', handleOpenMoveCardsModal);
    document.getElementById('btnConfirmMoveCards').addEventListener('click', handleConfirmMoveCards);
    document.getElementById('chkKeepOriginal').addEventListener('change', (e) => {
        document.getElementById('btnConfirmMoveCards').innerText = e.target.checked ? '복사' : '이동';
    });
}

// Bulk Card Selection & Move helper functions
function updateSelectedCardsUI() {
    const checkboxes = document.querySelectorAll('.card-select-cb');
    const checkedCount = document.querySelectorAll('.card-select-cb:checked').length;
    
    document.getElementById('selectedCardsCount').innerText = `${checkedCount}장 선택됨`;
    
    const btnMove = document.getElementById('btnMoveSelectedCards');
    if (checkedCount > 0) {
        btnMove.removeAttribute('disabled');
    } else {
        btnMove.setAttribute('disabled', 'true');
    }
    
    const cbSelectAll = document.getElementById('cbSelectAllCards');
    if (checkboxes.length > 0 && checkedCount === checkboxes.length) {
        cbSelectAll.checked = true;
    } else {
        cbSelectAll.checked = false;
    }
}

function handleOpenMoveCardsModal() {
    const checkedCbs = document.querySelectorAll('.card-select-cb:checked');
    if (checkedCbs.length === 0) return alert('선택된 카드가 없습니다.');
    
    const select = document.getElementById('moveCardsTargetSelect');
    select.innerHTML = '';
    
    const otherDecks = appData.decks.filter(d => d.id !== currentDeckId);
    if (otherDecks.length === 0) {
        return alert('이동할 수 있는 다른 덱이 없습니다. 새 덱을 먼저 생성해주세요.');
    }
    
    otherDecks.forEach(deck => {
        select.innerHTML += `<option value="${deck.id}">🗂️ ${deck.name} (${deck.cards.length}장)</option>`;
    });
    
    // Reset copy checkbox state and button text
    document.getElementById('chkKeepOriginal').checked = false;
    document.getElementById('btnConfirmMoveCards').innerText = '이동';
    
    openModal('modalMoveCards');
}

function handleConfirmMoveCards() {
    const targetDeckId = document.getElementById('moveCardsTargetSelect').value;
    if (!targetDeckId) return alert('이동할 덱을 선택해주세요.');
    
    const checkedCbs = document.querySelectorAll('.card-select-cb:checked');
    if (checkedCbs.length === 0) {
        closeModal('modalMoveCards');
        return;
    }
    
    const sourceDeck = appData.decks.find(d => d.id === currentDeckId);
    const targetDeck = appData.decks.find(d => d.id === targetDeckId);
    
    if (!sourceDeck || !targetDeck) {
        alert('덱을 찾을 수 없습니다.');
        return;
    }
    
    const keepOriginal = document.getElementById('chkKeepOriginal').checked;
    const cardIdsToMove = Array.from(checkedCbs).map(cb => cb.dataset.id);
    
    let cardsToTransfer = [];
    if (keepOriginal) {
        // Copy mode: deep copy cards (give new IDs and reset SRS state)
        cardsToTransfer = sourceDeck.cards
            .filter(c => cardIdsToMove.includes(c.id))
            .map(c => createNewCard(c.front, c.back, c.reference || ''));
    } else {
        // Move mode: take actual card objects and filter them out from source
        cardsToTransfer = sourceDeck.cards.filter(c => cardIdsToMove.includes(c.id));
        sourceDeck.cards = sourceDeck.cards.filter(c => !cardIdsToMove.includes(c.id));
    }
    
    targetDeck.cards.push(...cardsToTransfer);
    
    saveData();
    closeModal('modalMoveCards');
    renderDeckDetails();
    
    const actionWord = keepOriginal ? '복사' : '이동';
    alert(`${cardsToTransfer.length}개의 카드가 '${targetDeck.name}' 덱으로 ${actionWord}되었습니다.`);
}

// ==========================================
// 3. UI Navigation & Rendering
// ==========================================
function switchView(viewId) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    
    // Stop autoplay when leaving study view
    if (viewId !== 'study') {
        stopAutoPlay();
        endStudySession();
    }
    
    if (viewId === 'decks') {
        renderDeckList();
        renderGlobalStats();
        views.decks.classList.remove('hidden');
        currentDeckId = null;
    } else if (viewId === 'deckDetails') {
        renderDeckDetails();
        views.deckDetails.classList.remove('hidden');
    } else if (viewId === 'study') {
        views.study.classList.remove('hidden');
    } else if (viewId === 'logs') {
        renderLogs();
        views.logs.classList.remove('hidden');
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function renderDeckList() {
    const container = document.getElementById('deckListContainer');
    container.innerHTML = '';
    
    appData.folders.sort((a,b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    appData.decks.sort((a,b) => (a.sortIndex || 0) - (b.sortIndex || 0));

    function renderNode(parentId, depth) {
        let html = '';
        const folders = appData.folders.filter(f => f.parentId === parentId);
        const decks = appData.decks.filter(d => d.parentId === parentId);
        
        folders.forEach(f => {
            html += `
            <div class="tree-item" >
                <div class="folder-header" onclick="toggleFolder('${f.id}')" draggable="true" ondragstart="handleDragStart(event, '${f.id}', 'folder')" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${f.id}')">
                    <div class="folder-title">
                        <i data-lucide="folder"></i> ${f.name}
                    </div>
                    <div class="folder-actions">
                        <button class="icon-btn" onclick="moveOrder('${f.id}', 'folder', 'up'); event.stopPropagation();" title="위로"><i data-lucide="chevron-up"></i></button>
                        <button class="icon-btn" onclick="moveOrder('${f.id}', 'folder', 'down'); event.stopPropagation();" title="아래로"><i data-lucide="chevron-down"></i></button>
                        <button class="icon-btn" onclick="openMoveModal('${f.id}', 'folder'); event.stopPropagation();" title="이동"><i data-lucide="move"></i></button>
                        <button class="icon-btn" onclick="deleteFolder('${f.id}'); event.stopPropagation();" title="삭제"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
                <div class="folder-content" id="folder-content-${f.id}">
                    ${renderNode(f.id, depth + 1)}
                </div>
            </div>`;
        });
        
        decks.forEach(deck => {
            const dueCardsCount = deck.cards.filter(isCardDue).length;
            const totalCards = deck.cards.length;
            html += `
            <div class="tree-deck-card"  onclick="openDeck('${deck.id}')" draggable="true" ondragstart="handleDragStart(event, '${deck.id}', 'deck')" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDropOnDeck(event, '${deck.id}')">
                <div class="deck-info-tree">
                    <div class="deck-title-tree"><i data-lucide="layers"></i> ${deck.name}</div>
                    <div class="deck-stats-tree">카드 ${totalCards}장 | ${dueCardsCount}장 대기</div>
                </div>
                <div class="deck-actions-tree">
                    <button class="icon-btn" onclick="moveOrder('${deck.id}', 'deck', 'up'); event.stopPropagation();" title="위로"><i data-lucide="chevron-up"></i></button>
                    <button class="icon-btn" onclick="moveOrder('${deck.id}', 'deck', 'down'); event.stopPropagation();" title="아래로"><i data-lucide="chevron-down"></i></button>
                    <button class="icon-btn" onclick="openMoveModal('${deck.id}', 'deck'); event.stopPropagation();" title="이동"><i data-lucide="move"></i></button>
                    <button class="icon-btn" onclick="deleteDeck('${deck.id}'); event.stopPropagation();" title="삭제"><i data-lucide="trash-2"></i></button>
                </div>
            </div>`;
        });
        return html;
    }

    let treeHtml = renderNode('root', 0);
    treeHtml += `<div style="padding: 1rem; border: 2px dashed var(--border-color); border-radius: var(--radius-sm); text-align: center; margin-top: 1rem; color: var(--text-muted);" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'root')">최상위 위치로 이동 (여기로 드래그)</div>`;
    if (!treeHtml) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">아직 생성된 폴더나 덱이 없습니다. 새 덱을 만들어보세요!</p>';
    } else {
        container.innerHTML = treeHtml;
    }
    lucide.createIcons();
}

function openDeck(id) {
    currentDeckId = id;
    switchView('deckDetails');
}

function deleteDeck(id) {
    if(confirm('이 덱을 삭제하시겠습니까?')) {
        appData.decks = appData.decks.filter(d => d.id !== id);
        saveData();
        renderDeckList();
    }
}

function toggleFolder(id) {
    const content = document.getElementById(`folder-content-${id}`);
    if (content) content.classList.toggle('collapsed');
}

function deleteFolder(id) {
    if(confirm('폴더를 삭제하면 내부에 있는 모든 덱과 하위 폴더가 삭제됩니다. 정말 삭제하시겠습니까?')) {
        const idsToDelete = [id];
        let changed = true;
        while(changed) {
            changed = false;
            appData.folders.forEach(f => {
                if (idsToDelete.includes(f.parentId) && !idsToDelete.includes(f.id)) {
                    idsToDelete.push(f.id);
                    changed = true;
                }
            });
        }
        appData.folders = appData.folders.filter(f => !idsToDelete.includes(f.id));
        appData.decks = appData.decks.filter(d => !idsToDelete.includes(d.parentId));
        saveData();
        renderDeckList();
    }
}

function handleCreateFolder() {
    const nameInput = document.getElementById('folderNameInput');
    const name = nameInput.value.trim();
    if (!name) return alert('폴더 이름을 입력하세요.');
    
    appData.folders.push({
        id: generateId(),
        parentId: 'root',
        name: name,
        sortIndex: appData.folders.length,
        createdAt: Date.now()
    });
    
    saveData();
    nameInput.value = '';
    closeModal('modalCreateFolder');
    renderDeckList();
}

function openMoveModal(id, type) {
    document.getElementById('moveItemId').value = id;
    document.getElementById('moveItemType').value = type;
    
    const select = document.getElementById('moveTargetSelect');
    select.innerHTML = '<option value="root">최상위 위치 (기본)</option>';
    
    appData.folders.forEach(f => {
        // Prevent moving folder into itself
        if (type === 'folder' && f.id === id) return;
        select.innerHTML += `<option value="${f.id}">📁 ${f.name}</option>`;
    });
    
    openModal('modalMoveItem');
}

function handleMoveItem() {
    const id = document.getElementById('moveItemId').value;
    const type = document.getElementById('moveItemType').value;
    const targetId = document.getElementById('moveTargetSelect').value;
    
    if (type === 'folder') {
        const f = appData.folders.find(x => x.id === id);
        if (f) f.parentId = targetId;
    } else {
        const d = appData.decks.find(x => x.id === id);
        if (d) d.parentId = targetId;
    }
    saveData();
    closeModal('modalMoveItem');
    renderDeckList();
}

function renderDeckDetails() {
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck) return switchView('decks');
    
    document.getElementById('detailDeckTitle').innerText = deck.name;
    
    const dueCards = deck.cards.filter(isCardDue).length;
    const totalCards = deck.cards.length;
    
    let totalCorrect = 0;
    let totalAttempts = 0;
    deck.cards.forEach(c => {
        if (c.stats) {
            totalCorrect += c.stats.correct || 0;
            totalAttempts += (c.stats.correct || 0) + (c.stats.incorrect || 0);
        }
    });
    const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
    
    document.getElementById('statTotalCards').innerText = totalCards;
    document.getElementById('statDueCards').innerText = dueCards;
    document.getElementById('statAccuracy').innerText = `${accuracy}%`;
    
    const container = document.getElementById('cardListContainer');
    container.innerHTML = '';
    
    const actionsToolbar = document.getElementById('cardListActions');
    if (totalCards === 0) {
        if (actionsToolbar) actionsToolbar.classList.add('hidden');
        container.innerHTML = '<p style="text-align: center; padding: 1rem;">카드가 없습니다. 카드를 추가하거나 CSV로 가져오세요.</p>';
        return;
    } else {
        if (actionsToolbar) {
            actionsToolbar.classList.remove('hidden');
            document.getElementById('cbSelectAllCards').checked = false;
            document.getElementById('selectedCardsCount').innerText = '0장 선택됨';
            document.getElementById('btnMoveSelectedCards').setAttribute('disabled', 'true');
        }
    }
    
    deck.cards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'list-item-card';
        el.innerHTML = `
            <input type="checkbox" class="card-select-cb" data-id="${card.id}" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer; flex-shrink: 0; accent-color: var(--primary);">
            <div class="list-item-content">
                <div class="list-item-front">${decodeHtml(card.front)}</div>
                <div class="list-item-back">${decodeHtml(card.back)}</div>
            </div>
            <div style="display:flex; gap:0.5rem; align-items: center;">
                <button class="icon-btn btn-edit-card" data-id="${card.id}" aria-label="수정">
                    <i data-lucide="edit"></i>
                </button>
                <button class="icon-btn btn-delete-card" data-id="${card.id}" aria-label="삭제">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        el.querySelector('.card-select-cb').addEventListener('change', updateSelectedCardsUI);
        el.querySelector('.btn-edit-card').addEventListener('click', () => {
            document.getElementById('editCardId').value = card.id;
            document.getElementById('cardFrontInput').innerHTML = decodeHtml(card.front);
            document.getElementById('cardBackInput').innerHTML = decodeHtml(card.back);
            document.getElementById('cardReferenceInput').innerHTML = decodeHtml(card.reference || '');
            openModal('modalAddCard');
        });
        el.querySelector('.btn-delete-card').addEventListener('click', () => {
            if(confirm('카드를 삭제하시겠습니까?')) {
                deck.cards = deck.cards.filter(c => c.id !== card.id);
                saveData();
                renderDeckDetails();
            }
        });
        container.appendChild(el);
    });
    lucide.createIcons();
}

// ==========================================
// 4. Deck & Card Actions
// ==========================================
function handleCreateDeck() {
    const nameInput = document.getElementById('deckNameInput');
    const name = nameInput.value.trim();
    if (!name) return alert('덱 이름을 입력하세요.');
    
    appData.decks.push({
        id: generateId(),
        parentId: 'root',
        sortIndex: appData.decks.length,
        name: name,
        createdAt: Date.now(),
        cards: []
    });
    
    saveData();
    nameInput.value = '';
    closeModal('modalCreateDeck');
    renderDeckList();
}

function handleAddCard() {
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck) return;
    
    const editId = document.getElementById('editCardId').value;
    const front = document.getElementById('cardFrontInput').innerHTML.trim();
    const back = document.getElementById('cardBackInput').innerHTML.trim();
    const reference = document.getElementById('cardReferenceInput').innerHTML.trim();
    
    if (!front || !back) return alert('질문과 정답을 모두 입력하세요.');
    
    if (editId) {
        const cardIndex = deck.cards.findIndex(c => c.id === editId);
        if (cardIndex > -1) {
            deck.cards[cardIndex].front = front;
            deck.cards[cardIndex].back = back;
            deck.cards[cardIndex].reference = reference;
        }
    } else {
        deck.cards.push(createNewCard(front, back, reference));
    }
    
    saveData();
    closeModal('modalAddCard');
    renderDeckDetails();
}

function createNewCard(front, back, reference = '') {
    return {
        id: generateId(),
        front,
        back,
        reference,
        srs: {
            interval: 0,
            repetition: 0,
            easeFactor: 2.5,
            dueDate: Date.now()
        },
        stats: {
            correct: 0,
            incorrect: 0
        }
    };
}

// ==========================================
// 5. Study Mode (SRS logic)
// ==========================================
function isCardDue(card) {
    return card.srs.dueDate <= Date.now();
}

function toggleReverseMode() {
    isReversed = !isReversed;
    document.getElementById('btnToggleReverse').style.color = isReversed ? 'var(--primary)' : 'inherit';
    renderCurrentCard(); // Re-render card with new mode
}

function startStudySession() {
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck) return;
    
    // Select cards that are due
    currentStudyCards = deck.cards.filter(isCardDue);
    
    if (currentStudyCards.length === 0) {
        return alert('지금 학습할 카드가 없습니다! 훌륭합니다.');
    }
    
    // Shuffle cards
    currentStudyCards.sort(() => Math.random() - 0.5);
    currentStudyIndex = 0;
    isReversed = false;
    document.getElementById('btnToggleReverse').style.color = 'inherit';
    
    currentStudySession = {
        id: generateId(),
        deckId: currentDeckId,
        deckName: deck.name,
        mode: '대기 학습',
        startTime: Date.now(),
        totalCards: currentStudyCards.length,
        correct: 0,
        incorrect: 0
    };
    
    switchView('study');
    renderCurrentCard();
}

function startStudyAllSession(isRandom) {
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck) return;
    
    currentStudyCards = [...deck.cards];
    
    if (currentStudyCards.length === 0) {
        return alert('학습할 카드가 없습니다.');
    }
    
    if (isRandom) {
        currentStudyCards.sort(() => Math.random() - 0.5);
    }
    currentStudyIndex = 0;
    isReversed = false;
    document.getElementById('btnToggleReverse').style.color = 'inherit';
    
    currentStudySession = {
        id: generateId(),
        deckId: currentDeckId,
        deckName: deck.name,
        mode: isRandom ? '랜덤 복습' : '순차 복습',
        startTime: Date.now(),
        totalCards: currentStudyCards.length,
        correct: 0,
        incorrect: 0
    };
    
    switchView('study');
    renderCurrentCard();
}

function endStudySession() {
    if (currentStudySession) {
        currentStudySession.endTime = Date.now();
        const duration = Math.round((currentStudySession.endTime - currentStudySession.startTime) / 1000);
        currentStudySession.durationSeconds = duration;
        appData.studyLogs.unshift(currentStudySession); // prepend
        saveData();
        currentStudySession = null;
    }
}

function renderCurrentCard() {
    if (currentStudyIndex >= currentStudyCards.length) {
        alert('학습을 완료했습니다!');
        endStudySession();
        switchView('deckDetails');
        return;
    }
    
    const card = currentStudyCards[currentStudyIndex];
    const flashcard = document.getElementById('activeFlashcard');
    const inner = flashcard.querySelector('.flashcard-inner');
    
    // Temporarily remove transition to prevent text flash
    if (inner) inner.style.transition = 'none';
    flashcard.classList.remove('is-flipped');
    
    // Force reflow
    void flashcard.offsetWidth;
    
    if (inner) inner.style.transition = ''; // restore
    
    // Reset controls
    document.getElementById('btnShowAnswer').classList.remove('hidden');
    document.getElementById('srsControls').classList.add('hidden');
    
    // Setup Content based on Reverse mode
    const frontText = isReversed ? card.back : card.front;
    const backText = isReversed ? card.front : card.back;
    
    document.getElementById('cardFrontText').innerHTML = decodeHtml(frontText);
    document.getElementById('cardBackText').innerHTML = formatAnswerHtml(decodeHtml(backText));
    
    const refEl = document.getElementById('cardReferenceText');
    if (card.reference && !isReversed) {
        refEl.style.display = 'block';
        // Auto-linkify http references if it starts with http
        if (card.reference.startsWith('http')) {
            refEl.querySelector('span').innerHTML = `<a href="${card.reference}" target="_blank">${card.reference}</a>`;
        } else {
            refEl.querySelector('span').innerHTML = decodeHtml(card.reference);
        }
    } else {
        refEl.style.display = 'none';
    }
    
    // Progress
    const progressText = `${currentStudyIndex + 1} / ${currentStudyCards.length}`;
    document.getElementById('studyProgressText').innerText = progressText;
    
    const progressPercent = ((currentStudyIndex) / currentStudyCards.length) * 100;
    document.getElementById('studyProgressBar').style.width = `${progressPercent}%`;
    
    // AutoPlay Logic
    if (isAutoPlay) {
        autoPlayTimer = setTimeout(() => {
            if (!document.getElementById('activeFlashcard').classList.contains('is-flipped')) {
                showAnswer();
                autoPlayTimer = setTimeout(() => {
                    // Bypass SRS and just go to next card
                    currentStudyIndex++;
                    renderCurrentCard();
                }, 3000); // Wait 3s after showing answer
            }
        }, 3000); // Wait 3s to read question
    }
}

function flipCard() {
    if (isAutoPlay) return; // Prevent manual flip during autoplay
    document.getElementById('activeFlashcard').classList.toggle('is-flipped');
}

function showAnswer() {
    document.getElementById('activeFlashcard').classList.add('is-flipped');
    document.getElementById('btnShowAnswer').classList.add('hidden');
    if (!isAutoPlay) {
        document.getElementById('srsControls').classList.remove('hidden');
    }
}

function handleSrsAnswer(score) {
    const card = currentStudyCards[currentStudyIndex];
    let srs = card.srs;
    let stats = card.stats || { correct: 0, incorrect: 0 };
    
    // Global stats update
    const today = new Date().toISOString().split('T')[0];
    appData.statistics.daily[today] = (appData.statistics.daily[today] || 0) + 1;
    appData.statistics.totalCardsStudied++;
    appData.statistics.totalAttempts++;
    
    // Update Stats
    if (score >= 2) {
        stats.correct++;
        appData.statistics.totalCorrect++;
        if(currentStudySession) currentStudySession.correct++;
    } else {
        stats.incorrect++;
        if(currentStudySession) currentStudySession.incorrect++;
        // If "Again" or "Hard", push the card to the end of the session to review it again later today
        currentStudyCards.push(card);
    }
    card.stats = stats;
    
    // SM-2 Algorithm Implementation
    if (score < 2) {
        srs.repetition = 0;
        srs.interval = 1; // 1 day (or minutes in a real app, keeping it simple to 1 day)
    } else {
        if (srs.repetition === 0) srs.interval = 1;
        else if (srs.repetition === 1) srs.interval = 6;
        else {
            srs.interval = Math.round(srs.interval * srs.easeFactor);
        }
        srs.repetition++;
    }
    
    srs.easeFactor = srs.easeFactor + (0.1 - (3 - score) * (0.08 + (3 - score) * 0.02));
    if (srs.easeFactor < 1.3) srs.easeFactor = 1.3;
    
    // Set next due date (interval is in days, converted to ms)
    srs.dueDate = Date.now() + (srs.interval * 24 * 60 * 60 * 1000);
    
    // Save to global data
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (deck) {
        const cardIndexInDeck = deck.cards.findIndex(c => c.id === card.id);
        if (cardIndexInDeck > -1) {
            deck.cards[cardIndexInDeck] = card;
        }
    }
    saveData();
    
    // Next Card
    currentStudyIndex++;
    renderCurrentCard();
}

function toggleAutoPlay() {
    isAutoPlay = !isAutoPlay;
    const icon = document.getElementById('autoPlayIcon');
    if (isAutoPlay) {
        icon.setAttribute('data-lucide', 'pause-circle');
        document.getElementById('btnToggleAutoPlay').style.color = 'var(--primary)';
        lucide.createIcons();
        renderCurrentCard(); // trigger autoplay loop
    } else {
        stopAutoPlay();
        endStudySession();
    }
}

function stopAutoPlay() {
    isAutoPlay = false;
    const icon = document.getElementById('autoPlayIcon');
    if (icon) {
        icon.setAttribute('data-lucide', 'play-circle');
        document.getElementById('btnToggleAutoPlay').style.color = 'inherit';
        lucide.createIcons();
    }
    if (autoPlayTimer) {
        clearTimeout(autoPlayTimer);
        autoPlayTimer = null;
    }
}

function renderGlobalStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayCount = appData.statistics.daily[today] || 0;
    
    const accuracy = appData.statistics.totalAttempts > 0 
        ? Math.round((appData.statistics.totalCorrect / appData.statistics.totalAttempts) * 100) 
        : 0;
        
    document.getElementById('globalStatCards').innerText = todayCount;
    document.getElementById('globalStatTotal').innerText = appData.statistics.totalCardsStudied;
    document.getElementById('globalStatAccuracy').innerText = `${accuracy}%`;
}

// ==========================================
// 6. Text-to-Speech (TTS)
// ==========================================
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        // Try to auto-detect Korean, but let the browser decide default
        // utterance.lang = 'ko-KR'; 
        window.speechSynthesis.speak(utterance);
    } else {
        alert('이 브라우저는 음성 변환 기능을 지원하지 않습니다.');
    }
}

// ==========================================
// 7. CSV & JSON Export/Import
// ==========================================
function handleCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    Papa.parse(file, {
        complete: function(results) {
            const data = results.data;
            if (data.length === 0) return alert('CSV 파일이 비어있습니다.');
            
            const deckName = prompt('가져올 카드를 저장할 덱 이름을 입력하세요:', file.name.replace('.csv', ''));
            if (!deckName) return; // Cancelled
            
            const newDeck = {
                id: generateId(),
                name: deckName,
                createdAt: Date.now(),
                cards: []
            };
            
            // Assume format: Front, Back, Reference(optional)
            data.forEach(row => {
                if (row.length >= 2 && row[0].trim() !== '') {
                    newDeck.cards.push(createNewCard(row[0], row[1], row[2] || ''));
                }
            });
            
            appData.decks.push(newDeck);
            saveData();
            renderDeckList();
            alert(`${newDeck.cards.length}개의 카드를 성공적으로 가져왔습니다.`);
        },
        error: function(error) {
            alert('CSV 파싱 오류: ' + error.message);
        }
    });
    
    e.target.value = ''; // Reset input
}

function handleExportJson() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashpro_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleImportJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedData = JSON.parse(event.target.result);
            if (importedData && importedData.decks) {
                if(confirm('기존 데이터를 덮어쓰시겠습니까? (취소하면 병합됩니다)')) {
                    appData = importedData;
                } else {
                    appData.decks = [...appData.decks, ...importedData.decks];
                }
                saveData();
                renderDeckList();
                alert('데이터 복원이 완료되었습니다.');
            } else {
                alert('잘못된 백업 파일 포맷입니다.');
            }
        } catch (error) {
            alert('JSON 파싱 오류: ' + error.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
}

// ==========================================
// 8. PDF Export (jsPDF + html2canvas)
// ==========================================
async function handleExportPdf() {
    closeModal('modalExportPdf');
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck || deck.cards.length === 0) return alert('출력할 카드가 없습니다.');
    
    const layout = document.getElementById('pdfLayoutSelect').value;
    const cardsPerPage = layout === '8' ? 8 : 1;
    
    alert('PDF 생성을 시작합니다. 카드가 많을 경우 시간이 소요될 수 있습니다.');
    const btn = document.getElementById('btnConfirmExportPdf');
    btn.innerText = '생성 중...';
    btn.disabled = true;
    
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const exportContainer = document.getElementById('pdfExportContainer');
        exportContainer.style.left = '0';
        exportContainer.style.top = '0';
        exportContainer.style.position = 'relative';
        
        const totalChunks = Math.ceil(deck.cards.length / cardsPerPage);
        
        for (let i = 0; i < totalChunks; i++) {
            const chunk = deck.cards.slice(i * cardsPerPage, (i + 1) * cardsPerPage);
            
            const cardStyle8 = `
                background-color: #ffffff; 
                border: 1px solid #e5e7eb; 
                border-radius: 8px; 
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                box-sizing: border-box; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                padding: 1rem;
                color: #1f2937;
                overflow: hidden;
                font-family: 'Inter', -apple-system, sans-serif;
            `;
            const cardStyle1 = `
                background-color: #ffffff; 
                border: 1px solid #e5e7eb; 
                border-radius: 12px; 
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
                box-sizing: border-box; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                padding: 2rem;
                color: #1f2937;
                overflow: hidden;
                font-family: 'Inter', -apple-system, sans-serif;
            `;
            
            const frontText8 = `font-size: 8px; font-weight: 500; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; text-align: center; color: #1f2937; line-height: 1.4;`;
            const frontText1 = `font-size: 14px; font-weight: 500; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; text-align: center; color: #1f2937; line-height: 1.4;`;
            
            const backText8 = `font-size: 8px; font-weight: 500; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; text-align: center; color: #4f46e5; line-height: 1.4;`;
            const backText1 = `font-size: 14px; font-weight: 500; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; text-align: center; color: #4f46e5; line-height: 1.4;`;
            
            const refBox8 = `margin-top: 12px; font-size: 6px; padding: 10px; background-color: #e5e7eb; border-radius: 6px; width: 100%; text-align: left; white-space: pre-wrap; font-weight: 400; color: #1f2937; box-sizing: border-box; line-height: 1.4;`;
            const refBox1 = `margin-top: 24px; font-size: 9px; padding: 16px; background-color: #e5e7eb; border-radius: 8px; width: 100%; text-align: left; white-space: pre-wrap; font-weight: 400; color: #1f2937; box-sizing: border-box; line-height: 1.4;`;
            
            // Render Fronts Page
            let frontHtml = `<div class="pdf-card-container" style="width: 595px; min-height: 842px; display: flex; flex-wrap: wrap; align-content: flex-start; padding: 20px; background: #f3f4f6; box-sizing: border-box;">`;
            chunk.forEach(card => {
                if (cardsPerPage === 8) {
                    frontHtml += `
                        <div style="width: calc(50% - 20px); height: 180px; margin: 10px; ${cardStyle8}">
                            <div style="${frontText8}">${decodeHtml(card.front)}</div>
                        </div>
                    `;
                } else {
                    frontHtml += `
                        <div style="width: 100%; height: 800px; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 500px; height: 350px; ${cardStyle1}">
                                <div style="${frontText1}">${decodeHtml(card.front)}</div>
                            </div>
                        </div>
                    `;
                }
            });
            frontHtml += `</div>`;
            
            exportContainer.innerHTML = frontHtml;
            let canvas = await html2canvas(exportContainer.querySelector('.pdf-card-container'), { scale: 2 });
            let imgData = canvas.toDataURL('image/jpeg', 0.98);
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
            
            // Render Backs Page
            let backHtml = `<div class="pdf-card-container" style="width: 595px; min-height: 842px; display: flex; flex-wrap: wrap; align-content: flex-start; padding: 20px; background: #f3f4f6; box-sizing: border-box;">`;
            const backChunk = [];
            if (cardsPerPage === 8) {
                for (let j=0; j<chunk.length; j+=2) {
                    backChunk[j] = chunk[j+1];
                    backChunk[j+1] = chunk[j];
                }
            } else {
                backChunk.push(chunk[0]);
            }
            
            backChunk.forEach(card => {
                if(!card) {
                    if (cardsPerPage === 8) {
                        backHtml += `<div style="width: calc(50% - 20px); height: 180px; margin: 10px; box-sizing: border-box;"></div>`;
                    }
                } else {
                    if (cardsPerPage === 8) {
                        backHtml += `
                            <div style="width: calc(50% - 20px); height: 180px; margin: 10px; ${cardStyle8}">
                                <div style="${backText8}">${decodeHtml(card.back)}</div>
                                ${card.reference ? `<div style="${refBox8}"><strong style="font-weight: 600;">참고 자료:</strong><br>${decodeHtml(card.reference)}</div>` : ''}
                            </div>
                        `;
                    } else {
                        backHtml += `
                        <div style="width: 100%; height: 800px; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 500px; height: 350px; ${cardStyle1}">
                                <div style="${backText1}">${decodeHtml(card.back)}</div>
                                ${card.reference ? `<div style="${refBox1}"><strong style="font-weight: 600;">참고 자료:</strong><br>${decodeHtml(card.reference)}</div>` : ''}
                            </div>
                        </div>
                        `;
                    }
                }
            });
            backHtml += `</div>`;
            
            exportContainer.innerHTML = backHtml;
            canvas = await html2canvas(exportContainer.querySelector('.pdf-card-container'), { scale: 2 });
            imgData = canvas.toDataURL('image/jpeg', 0.98);
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
        }
        
        const fileNameInput = document.getElementById('pdfFileNameInput').value.trim() || 'flashcards';
        pdf.save(`${fileNameInput}.pdf`);
        
        exportContainer.style.position = 'absolute';
        exportContainer.style.left = '-9999px';
        exportContainer.innerHTML = '';
        
    } catch (error) {
        console.error(error);
        alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
        btn.innerText = '출력 시작';
        btn.disabled = false;
        lucide.createIcons();
    }
}

function handleExportCsvSelected() {
    const checkboxes = document.querySelectorAll('.csv-deck-cb:checked');
    if (checkboxes.length === 0) return alert('선택된 덱이 없습니다.');
    
    checkboxes.forEach(cb => {
        const deckId = cb.value;
        const deck = appData.decks.find(d => d.id === deckId);
        if (!deck || deck.cards.length === 0) return;
        
        const allCards = [];
        deck.cards.forEach(card => {
            allCards.push({
                "덱 이름": deck.name,
                "질문": card.front,
                "정답": card.back,
                "참고자료": card.reference || ''
            });
        });
        
        const csv = Papa.unparse(allCards);
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deck.name}_cards.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    
    closeModal('modalExportCsv');
}

// ==========================================
// 9. Theme Management
// ==========================================
function toggleTheme() {
    const newTheme = appData.settings.theme === 'light' ? 'dark' : 'light';
    appData.settings.theme = newTheme;
    saveData();
    applyTheme(newTheme);
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        document.getElementById('themeIcon').setAttribute('data-lucide', 'sun');
    } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
        document.getElementById('themeIcon').setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
}

function renderLogs() {
    const container = document.getElementById('logsListContainer');
    container.innerHTML = '';
    
    if (appData.studyLogs.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 2rem;">아직 기록된 학습 로그가 없습니다.</p>';
        return;
    }
    
    let currentDate = '';
    let bgColorToggle = false;
    
    appData.studyLogs.forEach(log => {
        const d = new Date(log.startTime);
        const dateOnly = d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeOnly = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        
        if (dateOnly !== currentDate) {
            currentDate = dateOnly;
            bgColorToggle = !bgColorToggle;
            container.innerHTML += `<div style="font-weight:bold; margin-top:1.5rem; margin-bottom:0.5rem; padding-bottom:0.3rem; border-bottom:2px solid var(--border-color); color: var(--primary);">${dateOnly}</div>`;
        }
        
        const bgColor = bgColorToggle ? 'var(--bg-card)' : 'transparent';
        
        const durSecs = log.durationSeconds || 0;
        const durationMin = Math.floor(durSecs / 60);
        const durationSec = durSecs % 60;
        const durStr = durationMin > 0 ? `${durationMin}분 ${durationSec}초` : `${durationSec}초`;
        
        const corr = log.correct || 0;
        const incorr = log.incorrect || 0;
        const accuracy = (corr + incorr) > 0 ? Math.round((corr / (corr + incorr)) * 100) : 0;
        const deckName = log.deckName || '알 수 없는 덱';
        const mode = log.mode || '학습 모드';
        
        container.innerHTML += `
        <div class="log-item" style="background: ${bgColor}; display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 1rem; border-left: 4px solid var(--primary); margin-bottom: 0.3rem; border-radius: 4px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); border-left-width: 4px;">
            <div style="flex: 2; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 0.5rem;">${deckName}</div>
            <div style="flex: 1; font-size: 0.85rem; color: var(--text-muted); text-align: center;">${timeOnly}</div>
            <div style="flex: 1; font-size: 0.85rem; color: var(--text-muted); text-align: center;">${durStr}</div>
            <div style="flex: 1; font-size: 0.85rem; color: var(--text-muted); text-align: center;">${mode}</div>
            <div style="flex: 1; font-size: 0.85rem; font-weight:600; color: var(--primary); text-align: right;">${accuracy}%</div>
        </div>`;
    });
    lucide.createIcons();
}

function moveOrder(id, type, direction) {
    const list = type === 'folder' ? appData.folders : appData.decks;
    const itemIndex = list.findIndex(x => x.id === id);
    if (itemIndex === -1) return;
    
    const item = list[itemIndex];
    const siblings = list.filter(x => x.parentId === item.parentId).sort((a,b) => (a.sortIndex||0) - (b.sortIndex||0));
    const currentIndex = siblings.findIndex(x => x.id === id);
    
    if (direction === 'up' && currentIndex > 0) {
        const prev = siblings[currentIndex - 1];
        const temp = item.sortIndex;
        item.sortIndex = prev.sortIndex;
        prev.sortIndex = temp;
    } else if (direction === 'down' && currentIndex < siblings.length - 1) {
        const next = siblings[currentIndex + 1];
        const temp = item.sortIndex;
        item.sortIndex = next.sortIndex;
        next.sortIndex = temp;
    }
    
    saveData();
    renderDeckList();
}

function handleDragStart(e, id, type) {
    e.dataTransfer.setData('text/plain', JSON.stringify({id, type}));
    e.stopPropagation();
}
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'var(--secondary-hover)';
    
    // Auto scroll logic when dragging
    const y = e.clientY;
    const h = window.innerHeight;
    if (y < 80) {
        window.scrollBy(0, -15);
    } else if (h - y < 80) {
        window.scrollBy(0, 15);
    }
}
function handleDragLeave(e) {
    e.currentTarget.style.backgroundColor = '';
}
function handleDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = '';
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'folder') {
            if (data.id === targetFolderId) return; // Cannot drop into itself
            const f = appData.folders.find(x => x.id === data.id);
            if (f) f.parentId = targetFolderId;
        } else {
            const d = appData.decks.find(x => x.id === data.id);
            if (d) d.parentId = targetFolderId;
        }
        saveData();
        renderDeckList();
    } catch(err) {
        console.error('Drop error', err);
    }
}

function handleEditDeckName() {
    const deck = appData.decks.find(d => d.id === currentDeckId);
    if (!deck) return;
    const newName = prompt('새로운 덱 이름을 입력하세요:', deck.name);
    if (newName && newName.trim()) {
        deck.name = newName.trim();
        saveData();
        document.getElementById('detailDeckTitle').innerText = deck.name;
    }
}

function handleDropOnDeck(e, targetDeckId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.style.backgroundColor = '';
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const targetDeck = appData.decks.find(x => x.id === targetDeckId);
        if (!targetDeck) return;
        
        const targetParentId = targetDeck.parentId;
        
        // 1. Find dragged item
        let draggedItem = null;
        if (data.type === 'folder') {
            if (data.id === targetParentId) return; // Cannot place parent inside folder containing it (simple check)
            draggedItem = appData.folders.find(x => x.id === data.id);
        } else {
            draggedItem = appData.decks.find(x => x.id === data.id);
        }
        if (!draggedItem) return;
        
        draggedItem.parentId = targetParentId;
        
        // 2. Reorder within target folder
        const siblingFolders = appData.folders.filter(x => x.parentId === targetParentId && x.id !== draggedItem.id);
        const siblingDecks = appData.decks.filter(x => x.parentId === targetParentId && x.id !== draggedItem.id);
        
        // Combine and sort siblings by current sortIndex
        const siblings = [...siblingFolders, ...siblingDecks].sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
        
        // Find target position
        const targetIdx = siblings.findIndex(x => x.id === targetDeckId);
        
        // Insert dragged item right before target item
        siblings.splice(targetIdx, 0, draggedItem);
        
        // Re-assign sortIndex values
        siblings.forEach((item, idx) => {
            item.sortIndex = idx;
        });
        
        saveData();
        renderDeckList();
    } catch(err) {
        console.error('Drop on deck error', err);
    }
}
