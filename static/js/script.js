document.addEventListener('DOMContentLoaded', () => {
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    let abnormalities = [];
    let ratings = {};
    let favorites = [];
    let userId = '';
    let currentFilter = 'all';
    let currentSort = 'risk-desc'; 

    // --- ЭЛЕМЕНТЫ DOM ---
    const grid = document.getElementById('abnormality-grid');
    const searchBar = document.getElementById('search-bar');
    const sortSelect = document.getElementById('sort-select');
    const clearFavoritesBtn = document.getElementById('clear-favorites-btn');
    const modalContainer = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    const closeModalButton = document.getElementById('close-button');

    // --- УПРАВЛЕНИЕ ID ПОЛЬЗОВАТЕЛЯ ---
    function manageUserId() {
        const storedId = localStorage.getItem('userId');
        if (storedId) { userId = storedId; } 
        else { userId = crypto.randomUUID(); localStorage.setItem('userId', userId); }
    }
    
    // --- ЗАГРУЗКА ДАННЫХ ---
    async function fetchData() {
        try {
            const [abnoRes, ratingsRes] = await Promise.all([
                fetch('/api/abnormalities'), fetch('/api/ratings')
            ]);
            abnormalities = await abnoRes.json();
            ratings = await ratingsRes.json();
            favorites = JSON.parse(localStorage.getItem('favorites')) || [];
            renderGrid();
        } catch (error) {
            console.error("Failed to fetch data:", error);
            grid.innerHTML = "<p>Error loading data. Please check the developer console (F12).</p>";
        }
    }

    // --- ОТОБРАЖЕНИЕ КАРТОЧЕК ---
    function renderGrid() {
        grid.innerHTML = '';
        
        // --- ЛОГИКА СОРТИРОВКИ ---
        const riskLevelWeights = { 'ZAYIN': 0, 'TETH': 1, 'HE': 2, 'WAW': 3, 'ALEPH': 4 };
        const sortedList = [...abnormalities].sort((a, b) => {
            const ratingA = ratings[a.id]?.average || 0;
            const ratingB = ratings[b.id]?.average || 0;
            const riskA = riskLevelWeights[a.riskLevel] ?? -1;
            const riskB = riskLevelWeights[b.riskLevel] ?? -1;

            switch (currentSort) {
                case 'risk-desc': return riskB - riskA;
                case 'risk-asc': return riskA - riskB;
                case 'rating-desc': return ratingB - ratingA;
                case 'rating-asc': return ratingA - ratingB;
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                default: return 0;
            }
        });

        // --- ЛОГИКА ФИЛЬТРАЦИИ ---
        const searchQuery = searchBar.value.toLowerCase();
        const filteredList = sortedList.filter(abno => {
            const name = abno.name || '';
            const id = abno.id || '';
            const matchesSearch = name.toLowerCase().includes(searchQuery) || id.toLowerCase().includes(searchQuery);
            if (currentFilter === 'favorites') return matchesSearch && favorites.includes(abno.id);
            return matchesSearch;
        });

        if (filteredList.length === 0) {
            grid.innerHTML = '<p>No abnormalities found.</p>';
            return;
        }

        filteredList.forEach(abno => {
            const isFavorite = favorites.includes(abno.id);
            const abnoRating = ratings[abno.id] || { average: 'N/A', count: 0 };
            const formatPercent = (val) => (val * 100).toFixed(0);

            const instinctPref = abno.workPreferences?.instinct?.[4] ?? 0;
            const insightPref = abno.workPreferences?.insight?.[4] ?? 0;
            const attachmentPref = abno.workPreferences?.attachment?.[4] ?? 0;
            const repressionPref = abno.workPreferences?.repression?.[4] ?? 0;

            const card = document.createElement('div');
            card.className = 'abnormality-card';
            card.dataset.id = abno.id;
            // цвета рамки
            if (abno.riskLevel) card.classList.add(`risk-${abno.riskLevel.toLowerCase()}`);

            card.innerHTML = `
                <img src="${abno.previewImage || 'static/images/ui/placeholder.png'}" alt="${abno.name}" onerror="this.src='static/images/ui/placeholder.png';">
                <p class="card-name">${abno.name || 'Unnamed'}</p>
                <div class="card-rating">★ ${abnoRating.average} (${abnoRating.count})</div>
                <div class="favorite-star ${isFavorite ? 'is-favorite' : ''}" data-id="${abno.id}">★</div>
                <div class="hover-info">
                    <h4>Work Preferences</h4>
                    <p>Instinct: ${formatPercent(instinctPref)}%</p>
                    <p>Insight: ${formatPercent(insightPref)}%</p>
                    <p>Attachment: ${formatPercent(attachmentPref)}%</p>
                    <p>Repression: ${formatPercent(repressionPref)}%</p>
                </div>`;
            
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('favorite-star')) showDetailsModal(abno.id);
            });
            card.querySelector('.favorite-star').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(abno.id);
            });
            grid.appendChild(card);
        });
    }

    // --- ЛОГИКА МОДАЛЬНОГО ОКНА ---
	function showDetailsModal(abnoId) {
		const abno = abnormalities.find(a => a.id === abnoId);
		if (!abno) return;

		const formatPercent = (val) => (val * 100).toFixed(0);
		const WORK_ORDER = ['instinct', 'insight', 'attachment', 'repression'];
		const RESISTANCE_ORDER = ['red', 'white', 'black', 'pale'];

		const getDamageInfo = (damageObj) => {
			let typeText, typeClass, typeIcon;
			const typeData = damageObj?.type;
			if (Array.isArray(typeData)) {
				typeText = "Random"; typeClass = "damage-type-random"; typeIcon = "damage_random.png";
			} else {
				typeText = typeData || 'N/A';
				typeClass = `damage-type-${(typeData || 'n/a').toLowerCase()}`;
				typeIcon = `damage_${(typeData || 'n/a').toLowerCase()}.png`;
			}
			const amount = damageObj?.damage ?? damageObj?.amount ?? 'N/A';
			return { typeText, typeClass, typeIcon, amount };
		};
		
		// --- Генерация основного контента ---
		const workDamage = getDamageInfo(abno.damage);
		
		const workPrefRows = WORK_ORDER.map(type => {
			const values = abno.workPreferences?.[type];
			if (!Array.isArray(values)) return '';
			const percentages = values.map(v => `<td>${formatPercent(v)}%</td>`).join('');
			const typeName = type.charAt(0).toUpperCase() + type.slice(1);
			return `<tr><td class="icon-text"><img src="static/images/ui/${type.toLowerCase()}.png" alt="${typeName}"><span class="work-type-${type.toLowerCase()}">${typeName}</span></td>${percentages}</tr>`;
		}).join('');

		const emotionalStatesHTML = abno.emotionalStates ? `
			<div class="modal-section"><div class="modal-section-header">Emotional States</div><div class="info-grid">
				<div class="icon-text"><img src="static/images/ui/good.png" alt="Good">Good:</div> <div class="emotional-good">${abno.emotionalStates.good}</div>
				<div class="icon-text"><img src="static/images/ui/normal.png" alt="Normal">Normal:</div> <div class="emotional-normal">${abno.emotionalStates.normal}</div>
				<div class="icon-text"><img src="static/images/ui/bad.png" alt="Bad">Bad:</div> <div class="emotional-bad">${abno.emotionalStates.bad}</div>
			</div></div>` : '';

		const workContentHTML = `
			<div class="modal-right-column">
				<div class="modal-section"><div class="modal-section-header">Basic Information</div><div class="info-grid"><div>Damage Type:</div><div class="icon-text"><img src="static/images/ui/${workDamage.typeIcon}" alt="${workDamage.typeText}"><span class="${workDamage.typeClass}">${workDamage.typeText}</span><span>&nbsp;(${workDamage.amount})</span></div><div>E-Box Yield:</div><div>${abno.eBoxYield ?? 'N/A'}</div><div>Qliphoth:</div><div>${abno.qliphothCounter ?? 'N/A'}</div></div></div>
				${emotionalStatesHTML}
				<div class="modal-section"><div class="modal-section-header">Work Preferences (Level I-V)</div><table class="work-pref-table"><thead><tr><th>Type</th><th>I</th><th>II</th><th>III</th><th>IV</th><th>V</th></tr></thead><tbody>${workPrefRows}</tbody></table></div>
				<div class="modal-section"><div class="modal-section-header">Management Guides</div><ul class="guides-list">${(abno.managementGuides || []).map(guide => `<li>${guide}</li>`).join('')}</ul></div>
			</div>`;

		// --- Генерация контента для вкладки "Breach" ---
		let breachContentHTML = '';
		if (abno.breachInfo) {
			const breachAttack = getDamageInfo(abno.breachInfo.attack);
			
			const getResistanceHTML = (value) => {
				let className = '';
				if (value < 0) className = 'res-heals';
				else if (value === 0) className = 'res-immune';
				else if (value < 1.0) className = 'res-resistant';
				else if (value === 1.0) className = 'res-normal';
				else if (value > 1.0) className = 'res-vulnerable';
				return `<span class="${className}">x${value}</span>`;
			};

			const resistancesHTML = RESISTANCE_ORDER.map(type => {
				const value = abno.breachInfo.resistances?.[type];
				if (value === undefined) return '';
				const typeName = type.charAt(0).toUpperCase() + type.slice(1);
				return `
					<div class="icon-text"><img src="static/images/ui/damage_${type}.png" alt="${typeName}"><span class="damage-type-${type}">${typeName}</span></div>
					<div>${getResistanceHTML(value)}</div>`;
			}).join('');

			breachContentHTML = `
				<div class="modal-right-column">
					<div class="modal-section"><div class="modal-section-header">Combat Stats</div><div class="info-grid"><div>HP:</div><div>${abno.breachInfo.hp}</div><div>Attack:</div><div class="icon-text"><img src="static/images/ui/${breachAttack.typeIcon}" alt="${breachAttack.typeText}"><span class="${breachAttack.typeClass}">${breachAttack.typeText}</span><span>&nbsp;(${breachAttack.amount})</span></div></div></div>
					<div class="modal-section"><div class="modal-section-header">Resistances</div><div class="info-grid">${resistancesHTML}</div></div>
				</div>`;
		}
		        // --- Генерация HTML для блока Observation ---
        let observationHTML = '';
        if (abno.observation && abno.observation.choices) {
            const choicesList = abno.observation.choices.map(item => {
                const icon = item.isCorrect ? '✅' : '❌';
                const className = item.isCorrect ? 'correct-choice' : 'incorrect-choice';
                // Мы не будем показывать ответ аномалии, чтобы не спойлерить
                return `<li class="${className}">${icon} ${item.choice}</li>`;
            }).join('');

            observationHTML = `
                <div class="modal-section">
                    <div class="modal-section-header">Observation</div>
                    <div class="observation-prompt">${abno.observation.prompt}</div>
                    <ul class="observation-choices">${choicesList}</ul>
                </div>`;
        } else {
            observationHTML = `
                <div class="modal-section">
                    <div class="modal-section-header">Observation</div>
                    <p class="default-observation">Default Answer: Approach</p>
                </div>`;
        }

		// --- Собираем ---
		const tabsHTML = `<div class="modal-tabs"><button class="modal-tab active" data-tab="work">Work Info</button>${abno.breachInfo ? '<button class="modal-tab" data-tab="breach">Breach Info</button>' : ''}</div>`;
        
        modalBody.innerHTML = `
            <div class="modal-header"><h2>${abno.name || 'Unnamed'}</h2><p>${abno.id || 'No ID'} | Risk Level: ${abno.riskLevel || 'N/A'}</p></div>
            ${abno.breachInfo ? tabsHTML : ''}
            <div class="modal-body-content">
                <div class="modal-left-column">
                    <img src="${abno.portraitImage || 'static/images/ui/placeholder.png'}" alt="${abno.name}" class="modal-portrait" onerror="this.src='static/images/ui/placeholder.png';">
                    <div class="modal-section"><div class="modal-section-header">Rate this Abnormality</div><div class="rating-stars" data-id="${abno.id}">${[...Array(5).keys()].map(i => `<span class="star" data-value="${i + 1}">★</span>`).join('')}</div></div>
                    <!-- ВОТ СЮДА ВСТАВЛЯЕМ НАШ НОВЫЙ БЛОК -->
                    ${observationHTML}
                </div>
                <div id="tab-work" class="modal-tab-content active">${workContentHTML}</div>
                ${abno.breachInfo ? `<div id="tab-breach" class="modal-tab-content">${breachContentHTML}</div>` : ''}
            </div>`;

		// --- Навешиваем обработчики ---
		modalBody.querySelector('.rating-stars')?.querySelectorAll('.star').forEach(star => {
			star.addEventListener('click', () => submitRating(abnoId, star.dataset.value));
		});
		modalBody.querySelectorAll('.modal-tab').forEach(tab => {
			tab.addEventListener('click', (e) => {
				const targetTab = e.target.dataset.tab;
				modalBody.querySelector('.modal-tab.active')?.classList.remove('active');
				modalBody.querySelector('.modal-tab-content.active')?.classList.remove('active');
				e.target.classList.add('active');
				modalBody.querySelector(`#tab-${targetTab}`).classList.add('active');
			});
		});
		modalContainer.style.display = 'flex';
	}

    // --- ЛОГИКА ИЗБРАННОГО ---
    function toggleFavorite(abnoId) {
        const favIndex = favorites.indexOf(abnoId);
        if (favIndex > -1) { favorites.splice(favIndex, 1); } 
        else { favorites.push(abnoId); }
        localStorage.setItem('favorites', JSON.stringify(favorites));
        renderGrid();
    }
    
    // --- ЛОГИКА РЕЙТИНГА ---
    async function submitRating(abnoId, ratingValue) {
        try {
            const response = await fetch('/api/rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ abnormality_id: abnoId, rating: parseInt(ratingValue), user_id: userId })
            });
            if (response.ok) {
                const ratingsRes = await fetch('/api/ratings');
                ratings = await ratingsRes.json();
                renderGrid();
                modalContainer.style.display = 'none';
            } else { throw new Error('Failed to submit rating'); }
        } catch (error) {
            console.error("Rating submission error:", error);
            alert('Could not submit your rating.');
        }
    }
    
    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---
    searchBar.addEventListener('input', renderGrid);
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderGrid();
    });
    clearFavoritesBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all your favorites?')) {
            favorites = [];
            localStorage.removeItem('favorites');
            renderGrid();
        }
    });
    closeModalButton.addEventListener('click', () => modalContainer.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modalContainer) modalContainer.style.display = 'none';
    });
    document.querySelectorAll('.category-filter').forEach(filterLink => {
        filterLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.category-filter.active')?.classList.remove('active');
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderGrid();
        });
    });

    // --- ИНИЦИАЛИЗАЦИЯ ---
    manageUserId();
    fetchData();
});