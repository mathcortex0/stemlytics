const SUPABASE_URL = 'https://zyixjqkdebxiiimwgzvf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7W2x2wCtJtcxQmmlV42SKw_VOkPwPfP';
const IMGBB_KEY = '4a780b9806217405482ea7632dac862b';

const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Homepage Logic
async function loadCourses() {
    const grid = document.getElementById('course-grid');
    if (!grid) return;
    const { data } = await supabase.from('courses').select('*');
    if (data) {
        grid.innerHTML = data.map(c => `
            <div class="card">
                <img src="${c.image_url}">
                <div class="card-content">
                    <h3>${c.title}</h3>
                    <div class="price">৳ ${c.price}</div>
                    <button class="btn-primary" onclick="location.href='payment.html?course_id=${c.id}'">Buy Now</button>
                </div>
            </div>
        `).join('');
    }
}

// 2. Payment Page Logic
async function initPayment() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('course_id');
    if (!id) return;

    const { data: course } = await supabase.from('courses').select('*').eq('id', id).single();
    if (course) {
        document.getElementById('selected-course-title').innerText = course.title;
        document.getElementById('course-price').innerText = course.price;
        window.currentCourseId = course.id;
    }

    document.getElementById('payment-form').onsubmit = handleOrder;
    document.getElementById('check-status-btn').onclick = () => checkStatus(localStorage.getItem('lastOrderId'));
}

async function handleOrder(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const orderData = {
        name: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value,
        telegram_username: document.getElementById('userTelegram').value,
        trx_id: document.getElementById('trxId').value,
        course_id: window.currentCourseId,
        course_name: document.getElementById('selected-course-title').innerText
    };

    const { data, error } = await supabase.from('orders').insert([orderData]).select();
    if (!error) {
        localStorage.setItem('lastOrderId', data[0].id);
        document.getElementById('payment-form').classList.add('hidden');
        document.getElementById('success-area').classList.remove('hidden');
    }
}

async function checkStatus(id) {
    const { data } = await supabase.from('orders').select('*, courses(telegram_link)').eq('id', id).single();
    if (data && data.status === 'approved') {
        document.getElementById('tg-area').classList.remove('hidden');
        document.getElementById('tg-link').href = data.courses.telegram_link;
        document.getElementById('check-status-btn').classList.add('hidden');
    } else {
        alert("Still Pending verification...");
    }
}

// 3. Admin Logic
if (document.getElementById('course-form')) {
    document.getElementById('course-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('addBtn');
        btn.innerText = "Processing...";
        
        const file = document.getElementById('cFile').files[0];
        const formData = new FormData();
        formData.append("image", file);

        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: formData });
        const imgData = await imgRes.json();

        const course = {
            title: document.getElementById('cTitle').value,
            price: document.getElementById('cPrice').value,
            telegram_link: document.getElementById('cTG').value,
            description: document.getElementById('cDesc').value,
            image_url: imgData.data.url
        };

        await supabase.from('courses').insert([course]);
        location.reload();
    };
}

async function fetchOrders() {
    const { data } = await supabase.from('orders').select('*').order('created_at', {ascending: false});
    document.getElementById('order-list').innerHTML = data.map(o => `
        <tr>
            <td>${o.name}</td><td>${o.course_name}</td><td>${o.trx_id}</td>
            <td>${o.status}</td>
            <td><button onclick="approve('${o.id}')">Approve</button></td>
        </tr>
    `).join('');
}

async function approve(id) {
    await supabase.from('orders').update({ status: 'approved' }).eq('id', id);
    fetchOrders();
}

function copyNumber() {
    navigator.clipboard.writeText("017XXXXXXXX");
    alert("Copied!");
}

// Startup
document.addEventListener('DOMContentLoaded', () => {
    loadCourses();
    if (window.location.pathname.includes('payment.html')) initPayment();
});
