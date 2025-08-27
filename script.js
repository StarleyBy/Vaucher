// Константы
const SHEET_ID = '1ETu3qsTX_pY6W0xtyRcEHzewi9MgHzm2-4kT0hnn4eI';
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // Будет заменено GitHub Actions
const API_KEY = 'YOUR_API_KEY'; // Будет заменено GitHub Actions
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4", "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
let gapiInited = false;
let tokenClient;
let accessToken = null;
let currentUser = null;
let userPermissions = [];
let groupCounter = 1;
let allStudents = [];
const timeSlots = [
    '7:30-9:00', '8:00-9:30', '8:30-10:00', '9:00-10:30', '9:30-11:00', '10:00-11:30',
    '10:30-12:00', '11:00-12:30', '11:30-13:00', '12:00-13:30', '12:30-14:00', '13:00-14:30',
    '13:30-15:00', '14:00-15:30', '14:30-16:00', '15:00-16:30', '15:30-17:00', '16:00-17:30',
    '16:30-18:00', '17:00-18:30', '17:30-19:00', '18:00-19:30', '18:30-20:00', '19:00-20:30',
    '19:30-21:00', '20:00-21:30', '20:30-22:00'
];
const weekDays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setupFileUploadLabels();
    showPage('loginPage');
    gapi.load('client', initGapiClient);
    document.getElementById('newStudentForm').addEventListener('submit', e => { e.preventDefault(); validateAndSaveNewStudent(); });
    document.getElementById('newGroupsForm').addEventListener('submit', e => { e.preventDefault(); validateAndSaveNewGroups(); });
    document.getElementById('ishurimForm').addEventListener('submit', e => { e.preventDefault(); saveIshurim(); });
    document.getElementById('receiptsForm').addEventListener('submit', e => { e.preventDefault(); saveReceipts(); });
    document.getElementById('infoModal').addEventListener('click', e => { if (e.target === document.getElementById('infoModal')) closeInfo(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInfo(); });
});

// Инициализация GAPI
function initGapiClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
    }).then(() => {
        gapiInited = true;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: () => {},
        });
    }).catch(err => console.error('GAPI init error', err));
}

// Получение токена
function getToken(callback) {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
    tokenClient.callback = resp => {
        if (resp.error) return showNotification('Ошибка авторизации', 'warning');
        accessToken = resp.access_token;
        callback();
    };
}

// Темы
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', newTheme);
    document.querySelector('.theme-toggle').textContent = newTheme === 'light' ? '🌙' : '☀️';
    localStorage.setItem('theme', newTheme);
}

function initializeTheme() {
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.body.setAttribute('data-theme', savedTheme);
    document.querySelector('.theme-toggle').textContent = savedTheme === 'light' ? '🌙' : '☀️';
}

// Навигация
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    const page = document.getElementById(pageId);
    page.classList.remove('hidden');
    page.classList.add('page-transition');
}

function showMainMenu() {
    showPage('mainMenu');
}

function showNewStudent() {
    if (!userPermissions.includes('newStudent')) return;
    getToken(async () => {
        try {
            const [cities, payments, groups] = await Promise.all([
                loadSheetData('SERV!G3:G100'),
                loadSheetData('SERV!I3:I100'),
                loadSheetData('SERV!T3:T100')
            ]);
            
            const citySelect = document.getElementById('city');
            citySelect.innerHTML = '<option value="">Выберите город</option>' + cities.map(c => `<option value="${c[0]}">${c[0]}</option>`).join('');
            
            const paymentSelect = document.getElementById('payment');
            paymentSelect.innerHTML = '<option value="">Выберите опцию</option>' + payments.map(p => `<option value="${p[0]}">${p[0]}</option>`).join('');
            
            const groupSelect = document.getElementById('group');
            groupSelect.innerHTML = '<option value="">Выберите группу</option>' + groups.map(g => `<option value="${g[0]}">${g[0]}</option>`).join('') + '<option value="addNew">Добавить группу</option>';
            groupSelect.onchange = () => {
                if (groupSelect.value === 'addNew') {
                    showNewGroups();
                    groupSelect.onchange = null;
                }
            };
            
            showPage('newStudentPage');
        } catch (err) {
            showNotification('Ошибка загрузки данных', 'warning');
        }
    });
}

function showNewGroups() {
    if (!userPermissions.includes('newGroups')) return;
    getToken(async () => {
        try {
            groupCounter = 1;
            document.getElementById('groupsContainer').innerHTML = '';
            addNewGroup();
            
            const staff = await loadStaffData();
            const teachers = staff.filter(s => s.position === 'учитель').map(s => s.name);
            
            document.querySelectorAll('.group-teacher').forEach(select => {
                select.innerHTML = '<option value="">Выберите учителя</option>' + teachers.map(t => `<option value="${t}">${t}</option>`).join('');
            });
            
            showPage('newGroupsPage');
        } catch (err) {
            showNotification('Ошибка загрузки', 'warning');
        }
    });
}

function showIshurim() {
    if (!userPermissions.includes('ishurim')) return;
    getToken(async () => {
        try {
            const students = await loadSheetData('MAIN!A:D,P:Q');
            const available = students.filter(row => row[0] && !row[5] && !row[6]);
            
            const select = document.getElementById('ishurimStudent');
            select.innerHTML = '<option value="">Выберите ученика</option>' + available.map(row => 
                `<option value="${row[0]}" data-tz="${row[3]}">${row[0]}</option>`
            ).join('');
            
            showPage('ishurimPage');
        } catch (err) {
            showNotification('Ошибка загрузки', 'warning');
        }
    });
}

function showReceipts() {
    if (!userPermissions.includes('receipts')) return;
    getToken(async () => {
        try {
            const students = await loadSheetData('MAIN!A:D,L:L,R:R');
            const available = students.filter(row => row[0] && !row[7]);
            
            const select = document.getElementById('receiptsStudent');
            select.innerHTML = '<option value="">Выберите ученика</option>' + available.map(row => 
                `<option value="${row[0]}" data-tz="${row[3]}" data-course200="${row[4] === 'Да'}">${row[0]}</option>`
            ).join('');
            
            showPage('receiptsPage');
        } catch (err) {
            showNotification('Ошибка загрузки', 'warning');
        }
    });
}

function showDatabase() {
    if (!userPermissions.includes('database')) return;
    getToken(async () => {
        try {
            document.getElementById('databaseLoading').classList.remove('hidden');
            allStudents = await loadSheetData('MAIN!A:S');
            loadAllStudents();
            showPage('databasePage');
        } catch (err) {
            showNotification('Ошибка загрузки', 'warning');
        } finally {
            document.getElementById('databaseLoading').classList.add('hidden');
        }
    });
}

function showInfo() { document.getElementById('infoModal').classList.remove('hidden'); }
function closeInfo() { document.getElementById('infoModal').classList.add('hidden'); }

function logout() {
    currentUser = null;
    userPermissions = [];
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showPage('loginPage');
}

// Аутентификация
function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');
    
    if (!username || !password) return showError(errorDiv, 'Введите логин и пароль');
    
    getToken(() => {
        loadStaffData().then(staff => {
            const user = staff.find(s => s.login === username && s.password === password);
            if (user) {
                currentUser = user;
                userPermissions = getPermissions(user.position);
                hideError(errorDiv);
                setupPermissions();
                showMainMenu();
                showNotification('✅ Успешный вход!');
            } else {
                showError(errorDiv, 'Неверный логин или пароль');
            }
        }).catch(err => showNotification('Ошибка загрузки данных', 'warning'));
    });
}

async function loadStaffData() {
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'SERV!A3:E100',
    });
    return response.result.values.map(row => ({
        name: row[0],
        position: row[1],
        phone: row[2],
        login: row[3],
        password: row[4]
    })).filter(u => u.login && u.password);
}

function getPermissions(position) {
    const perms = {
        'ульпан': ['ishurim', 'receipts', 'database'],
        'финотдел': ['ishurim', 'receipts', 'database'],
        'продавец': ['newStudent', 'newGroups', 'database'],
        'администратор': ['newStudent', 'newGroups', 'ishurim', 'receipts', 'database'],
        'куратор': ['newStudent', 'newGroups', 'ishurim', 'receipts', 'database'],
        'учитель': ['database']
    };
    return perms[position] || [];
}

function setupPermissions() {
    const menuItems = {
        newStudent: 'newStudentBtn',
        newGroups: 'newGroupsBtn',
        ishurim: 'ishurimBtn',
        receipts: 'receiptsBtn',
        database: 'databaseBtn'
    };
    Object.keys(menuItems).forEach(perm => {
        const btn = document.getElementById(menuItems[perm]);
        if (userPermissions.includes(perm)) {
            btn.classList.remove('disabled');
        } else {
            btn.classList.add('disabled');
        }
    });
}

// Утилиты
function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideError(element) {
    element.classList.add('hidden');
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${type === 'success' ? 'var(--success-gradient)' : 'var(--danger-gradient)'};
        color: white; padding: 15px 25px; border-radius: 15px; box-shadow: var(--shadow-3d); z-index: 10000; animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function setupFileUploadLabels() {
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', () => {
            const label = input.nextElementSibling;
            if (input.files[0]) {
                label.textContent = `✅ ${input.files[0].name}`;
                label.style.background = 'var(--success-gradient)';
            }
        });
    });
}

async function uploadToDrive(file, folderId) {
    const metadata = {
        name: file.name,
        mimeType: file.type,
        parents: [folderId]
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
    form.append('file', file);
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({'Authorization': 'Bearer ' + accessToken}),
        body: form
    });
    const result = await response.json();
    return `https://drive.google.com/file/d/${result.id}/view`;
}

async function appendToSheet(sheetName, values) {
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [values] }
    });
}

async function updateSheet(sheetName, range, values) {
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!${range}`,
        valueInputOption: 'RAW',
        resource: { values: [[...values]] }
    });
}

async function loadSheetData(range) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range
    });
    return response.result.values || [];
}

// Новый ученик
async function validateAndSaveNewStudent() {
    const submitBtn = document.querySelector('#newStudentForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Сохраняем...';
    
    try {
        const allStudents = await loadSheetData('MAIN!A:D');
        const nameRu = document.getElementById('studentNameRu').value;
        const tz = document.getElementById('tz').value;
        const nameRuError = document.getElementById('nameRuError');
        const tzError = document.getElementById('tzError');
        
        if (allStudents.some(row => row[0] === nameRu)) {
            showError(nameRuError, 'Ученик с таким именем существует');
            throw new Error();
        }
        if (allStudents.some(row => row[3] === tz)) {
            showError(tzError, 'Ученик с таким ТЗ существует');
            throw new Error();
        }
        
        const tzFile = document.getElementById('tzFile').files[0];
        const voucherFile = document.getElementById('voucherFile').files[0];
        const course200 = document.querySelector('input[name="course200"]:checked').value;
        const course200File = course200 === 'Да' ? document.getElementById('course200File').files[0] : null;
        
        const [tzLink, voucherLink, course200Link] = await Promise.all([
            uploadToDrive(tzFile, '1r6dfES7iutO9J2HjvOQSQ9Xd-BqcIXcmTOQZlzigv1oCHXd7Ool75Bc4T2Jo3wLph7ryT1ou'),
            uploadToDrive(voucherFile, '1AZmZZL-DLjyjvDmV0tjNriTaIf_AH_6UzXfhfcAlaNApEMuV_j9DLPfO44vRqo0zGZ3-sMVo'),
            course200 === 'Да' ? uploadToDrive(course200File, '1paDpElQ2tRI7RlhB3yl2FO8o1gPyVjIDh32PXLrIlzO47tQyzJmrO0hQ-Dh_lgkRixZw36WB') : ''
        ]);
        
        const values = [
            nameRu,
            document.getElementById('studentNameHe').value,
            document.getElementById('phone').value,
            tz,
            tzLink,
            document.getElementById('city').value,
            document.getElementById('email').value,
            document.getElementById('level').value,
            document.getElementById('startDate').value,
            document.getElementById('group').value,
            voucherLink,
            course200,
            course200Link,
            document.getElementById('payment').value,
            document.getElementById('paymentDate').value || ''
        ];
        
        await appendToSheet('MAIN', values);
        showNotification('✅ Ученик сохранен!');
        document.getElementById('newStudentForm').reset();
        showMainMenu();
    } catch (err) {
        showNotification('Ошибка сохранения', 'warning');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Сохранить';
    }
}

function toggleCourse200() {
    const value = document.querySelector('input[name="course200"]:checked')?.value;
    const div = document.getElementById('course200FileDiv');
    const input = document.getElementById('course200File');
    div.classList.toggle('hidden', value !== 'Да');
    input.required = value === 'Да';
}

function togglePaymentDate() {
    const value = document.getElementById('payment').value;
    const div = document.getElementById('paymentDateDiv');
    const input = document.getElementById('paymentDate');
    div.style.display = value === 'Дата оплаты указана точно' ? 'block' : 'none';
    input.required = value === 'Дата оплаты указана точно';
}

// Новые группы
function addNewGroup() {
    const container = document.getElementById('groupsContainer');
    const groupDiv = document.createElement('div');
    groupDiv.className = 'group-form';
    groupDiv.innerHTML = `
        <h3 style="text-align: center; margin-bottom: 20px; color: var(--text-color);">👥 Группа ${groupCounter}</h3>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">👨‍🏫 Учитель</label>
                <select class="form-select group-teacher" required>
                    <option value="">Выберите учителя</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🎯 Уровень</label>
                <select class="form-select group-level" required>
                    <option value="">Выберите уровень</option>
                    <option value="начинающие">Начинающие</option>
                    <option value="продвинутые">Продвинутые</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">📅 Дни занятий (выберите 2)</label>
            <div class="days-selector">
                ${weekDays.map(day => `<div class="day-btn" onclick="selectDay(this, ${groupCounter})">${day}</div>`).join('')}
            </div>
            <div id="selectedDays${groupCounter}" style="margin-top: 10px; font-weight: 600;"></div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">🕐 Время (день 1)</label>
                <select class="form-select group-time1" required>
                    <option value="">Выберите время</option>
                    ${timeSlots.map(time => `<option value="${time}">${time}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🕑 Время (день 2)</label>
                <select class="form-select group-time2" required>
                    <option value="">Выберите время</option>
                    ${timeSlots.map(time => `<option value="${time}">${time}</option>`).join('')}
                </select>
            </div>
        </div>
        <div style="text-align: center; margin-top: 15px;">
            <button type="button" class="btn" style="background: var(--danger-gradient); color: white;" onclick="removeGroup(this)">
                🗑️ Удалить
            </button>
        </div>
    `;
    container.appendChild(groupDiv);
    groupCounter++;
    if (groupCounter > 4) document.querySelector('[onclick="addNewGroup()"]').style.display = 'none';
}

function selectDay(dayBtn, groupNum) {
    const groupDiv = dayBtn.closest('.group-form');
    const selectedDays = groupDiv.querySelectorAll('.day-btn.selected');
    const infoDiv = groupDiv.querySelector(`#selectedDays${groupNum}`);
    
    if (dayBtn.classList.contains('selected')) {
        dayBtn.classList.remove('selected');
    } else if (selectedDays.length < 2) {
        dayBtn.classList.add('selected');
    } else {
        showNotification('⚠️ Только 2 дня', 'warning');
        return;
    }
    
    const newSelected = Array.from(groupDiv.querySelectorAll('.day-btn.selected')).map(btn => btn.textContent);
    infoDiv.textContent = newSelected.length ? `Выбрано: ${newSelected.join(', ')}` : '';
}

function removeGroup(btn) {
    const groups = document.querySelectorAll('.group-form');
    if (groups.length > 1) {
        btn.closest('.group-form').remove();
        document.querySelector('[onclick="addNewGroup()"]').style.display = 'inline-block';
    } else {
        showNotification('⚠️ Минимум одна группа', 'warning');
    }
}

async function validateAndSaveNewGroups() {
    const submitBtn = document.querySelector('#newGroupsForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Отправляем...';
    
    try {
        const month = document.getElementById('courseMonth').value;
        const day = document.getElementById('courseDay').value;
        const groups = document.querySelectorAll('.group-form');
        
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const selectedDays = group.querySelectorAll('.day-btn.selected');
            if (selectedDays.length !== 2) throw new Error(`Группа ${i+1}: выберите 2 дня`);
            
            const day1 = selectedDays[0].textContent;
            const day2 = selectedDays[1].textContent;
            const values = [
                month,
                day,
                i + 1,
                group.querySelector('.group-teacher').value,
                day1,
                group.querySelector('.group-time1').value,
                day2,
                group.querySelector('.group-time2').value,
                group.querySelector('.group-level').value,
                `${month} ${day} - Группа ${i+1}`
            ];
            
            await appendToSheet('SERV', values);
        }
        
        showNotification('✅ Группы сохранены!');
        document.getElementById('newGroupsForm').reset();
        showMainMenu();
    } catch (err) {
        showNotification(err.message || 'Ошибка сохранения', 'warning');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📤 Отправить';
    }
}

// Ишуры
function loadStudentTZ(type) {
    const select = document.getElementById(`${type}Student`);
    const tzInput = document.getElementById(`${type}TZ`);
    const selected = select.options[select.selectedIndex];
    tzInput.value = selected ? selected.dataset.tz : '';
}

async function saveIshurim() {
    const submitBtn = document.querySelector('#ishurimForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Отправляем...';
    
    try {
        const name = document.getElementById('ishurimStudent').value;
        const tz = document.getElementById('ishurimTZ').value;
        const arshamaFile = document.getElementById('ishurimArshamaFile').files[0];
        const tkhilatFile = document.getElementById('ishurimTkhilatFile').files[0];
        
        const [arshamaLink, tkhilatLink] = await Promise.all([
            uploadToDrive(arshamaFile, '1cNyRHRjNTEvbj3hnA5gN8WLp3oVkM0sJxOdae-HVaGtlQY5bXd09XmtD_Zf59deCI7uTbh5k'),
            uploadToDrive(tkhilatFile, '1iTVVPqA_W1Ew4fsf3v_JSKmXnr1MXJ32w1wdMSspMi_0pkYbO9JxmhwblZSj3db3Dph9aSPS')
        ]);
        
        const students = await loadSheetData('MAIN!A:Z');
        const rowIndex = students.findIndex(row => row[0] === name && row[3] === tz) + 1;
        
        if (rowIndex === 0) throw new Error('Ученик не найден');
        
        await updateSheet('MAIN', `P${rowIndex}:Q${rowIndex}`, [arshamaLink, tkhilatLink]);
        
        showNotification('✅ Ишуры сохранены!');
        document.getElementById('ishurimForm').reset();
        showMainMenu();
    } catch (err) {
        showNotification('Ошибка сохранения', 'warning');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📤 Отправить';
    }
}

// Квитанции
function checkCourse200() {
    const select = document.getElementById('receiptsStudent');
    const selected = select.options[select.selectedIndex];
    const div = document.getElementById('receipt200Div');
    const input = document.getElementById('receipt200File');
    
    const is200 = selected && selected.dataset.course200 === 'true';
    div.classList.toggle('hidden', !is200);
    input.required = is200;
}

async function saveReceipts() {
    const submitBtn = document.querySelector('#receiptsForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Отправляем...';
    
    try {
        const name = document.getElementById('receiptsStudent').value;
        const tz = document.getElementById('receiptsTZ').value;
        const receipt5000File = document.getElementById('receipt5000File').files[0];
        const receipt200File = document.getElementById('receipt200File').files[0] || null;
        
        const receipt5000Link = await uploadToDrive(receipt5000File, '1zOPAOXQfAmDzSDjWWisbBhMHPkIGaLO0GrIlpwylRUxCkHUZv4Fghav07QaT9ZqW4jFVAxv9');
        const receipt200Link = receipt200File ? await uploadToDrive(receipt200File, '1tSgDiBBGIUuCBmicMaknuMG3wq-ucH2ybU9JZBIAR2DeuiJNgjrYsB2AW8MxjCfiCUgLvRzY') : '';
        
        const students = await loadSheetData('MAIN!A:Z');
        const rowIndex = students.findIndex(row => row[0] === name && row[3] === tz) + 1;
        
        if (rowIndex === 0) throw new Error('Ученик не найден');
        
        await updateSheet('MAIN', `R${rowIndex}:S${rowIndex}`, [receipt5000Link, receipt200Link]);
        
        showNotification('✅ Квитанции сохранены!');
        document.getElementById('receiptsForm').reset();
        showMainMenu();
    } catch (err) {
        showNotification('Ошибка сохранения', 'warning');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📤 Отправить';
    }
}

// База
function loadAllStudents() {
    displayStudents(allStudents);
}

function searchStudents() {
    const nameQuery = document.getElementById('searchByName').value.toLowerCase();
    const tzQuery = document.getElementById('searchByTZ').value;
    
    const filtered = allStudents.filter(row => 
        (nameQuery && row[0] && row[0].toLowerCase().includes(nameQuery)) ||
        (tzQuery && row[3] && row[3].includes(tzQuery))
    );
    displayStudents(filtered);
}

function displayStudents(students) {
    const results = document.getElementById('searchResults');
    results.innerHTML = '';
    
    students.forEach(row => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.innerHTML = `
            <h3>${row[0] || ''} (${row[1] || ''})</h3>
            <div class="student-info">
                <div class="info-item"><span class="info-label">Телефон:</span> <span class="info-value">${row[2] || ''}</span></div>
                <div class="info-item"><span class="info-label">ТЗ:</span> <span class="info-value">${row[3] || ''}</span></div>
                <div class="info-item"><span class="info-label">Фото ТЗ:</span> ${row[4] ? `<a href="${row[4]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">Город:</span> <span class="info-value">${row[5] || ''}</span></div>
                <div class="info-item"><span class="info-label">Email:</span> <span class="info-value">${row[6] || ''}</span></div>
                <div class="info-item"><span class="info-label">Уровень:</span> <span class="info-value">${row[7] || ''}</span></div>
                <div class="info-item"><span class="info-label">Дата начала:</span> <span class="info-value">${row[8] || ''}</span></div>
                <div class="info-item"><span class="info-label">Группа:</span> <span class="info-value">${row[9] || ''}</span></div>
                <div class="info-item"><span class="info-label">Ваучер:</span> ${row[10] ? `<a href="${row[10]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">Курс 200:</span> <span class="info-value">${row[11] || ''}</span></div>
                <div class="info-item"><span class="info-label">Фото 200:</span> ${row[12] ? `<a href="${row[12]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">Оплата:</span> <span class="info-value">${row[13] || ''}</span></div>
                <div class="info-item"><span class="info-label">Дата оплаты:</span> <span class="info-value">${row[14] || ''}</span></div>
                <div class="info-item"><span class="info-label">ИА:</span> ${row[15] ? `<a href="${row[15]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">ИТЛ:</span> ${row[16] ? `<a href="${row[16]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">Квитанция 5000:</span> ${row[17] ? `<a href="${row[17]}" target="_blank">Ссылка</a>` : ''}</div>
                <div class="info-item"><span class="info-label">Квитанция 200:</span> ${row[18] ? `<a href="${row[18]}" target="_blank">Ссылка</a>` : ''}</div>
            </div>
        `;
        results.appendChild(card);
    });
    
    if (!students.length) results.innerHTML = '<p style="text-align: center;">Нет результатов</p>';
}

function clearSearch() {
    document.getElementById('searchByName').value = '';
    document.getElementById('searchByTZ').value = '';
    displayStudents(allStudents);
}
