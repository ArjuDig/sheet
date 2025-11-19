document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const toggleSidebar = document.querySelector('.toggle-sidebar');
    const toggleDarkMode = document.querySelector('.toggle-dark-mode');
    const darkModeIcon = toggleDarkMode.querySelector('i');
    const menuItems = document.querySelectorAll('.menu-item');
    const bottomBarItems = document.querySelectorAll('.bottom-bar-item');
    const contentSections = document.querySelectorAll('.content-section');
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    // --- (BARU) Variabel global untuk Bank Soal ---
    let latestSoalResult = null; // Menyimpan JSON soal terakhir
    const BANK_SOAL_DB_KEY = 'bankSoalDB_ArjuSheet'; // Kunci LocalStorage

    // --- Toggle Sidebar (Desktop/Mobile) ---
    toggleSidebar.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });

    // --- Toggle Dark Mode ---
    toggleDarkMode.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            darkModeIcon.classList.remove('fa-moon');
            darkModeIcon.classList.add('fa-sun');
            localStorage.setItem('darkMode', 'enabled');
        } else {
            darkModeIcon.classList.remove('fa-sun');
            darkModeIcon.classList.add('fa-moon');
            localStorage.setItem('darkMode', 'disabled');
        }
    });

    // Cek preferensi dark mode saat memuat halaman
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeIcon.classList.remove('fa-moon');
        darkModeIcon.classList.add('fa-sun');
    }

    // --- Navigasi Menu ---
    function switchTab(target) {
        // Sembunyikan semua konten
        contentSections.forEach(section => section.classList.remove('active'));
        
        // Hapus aktif dari semua item menu
        menuItems.forEach(item => item.classList.remove('active'));
        bottomBarItems.forEach(item => item.classList.remove('active'));

        // Tampilkan konten yang dituju
        const activeContent = document.getElementById(target);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        // Aktifkan item menu yang sesuai di sidebar dan bottom bar
        const activeMenuItem = document.querySelector(`.menu-item[data-target="${target}"]`);
        if (activeMenuItem) activeMenuItem.classList.add('active');
        
        const activeBottomBarItem = document.querySelector(`.bottom-bar-item[data-target="${target}"]`);
        if (activeBottomBarItem) activeBottomBarItem.classList.add('active');

        // (BARU) Muat Bank Soal jika tab Bank Soal aktif
        if (target === 'bank-soal') {
            loadBankSoal();
        }
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.target));
    });

    bottomBarItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.target));
    });

    // --- Notifikasi ---
    function showNotification(message, isError = false) {
        notificationText.textContent = message;
        if (isError) {
            notification.classList.add('error');
        } else {
            notification.classList.remove('error');
        }
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000); // Notifikasi hilang setelah 3 detik
    }

    // --- GEMINI API HELPER FUNCTIONS ---

    /**
     * Fungsi pembantu untuk fetch dengan retry (upaya ulang) eksponensial.
     */
    async function fetchWithRetry(url, options, maxRetries = 3) {
        let delay = 1000; // 1 detik
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    // Cek untuk 429 (Too Many Requests) atau 5xx (Server Errors) untuk retry
                    if (response.status === 429 || response.status >= 500) {
                        throw new Error(`API Error ${response.status}: ${response.statusText}`);
                    }
                    // Error klien lain (400, 404, dll) jangan di-retry
                    const errorBody = await response.json();
                    console.error("API Client Error:", errorBody);
                    throw new Error(`API Client Error: ${errorBody.error?.message || response.statusText}`);
                }
                return await response.json();
            } catch (error) {
                console.warn(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}. Retrying in ${delay / 1000}s...`);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Double delay
                } else {
                    throw new Error(`API call failed after ${maxRetries} attempts: ${error.message}`);
                }
            }
        }
    }

    /**
     * Memanggil Gemini API untuk generasi teks (atau JSON).
     */
    async function callGeminiAPI(userPrompt, systemInstruction, jsonSchema = null) {
        const apiKey = ""; // Dibiarkan kosong, akan di-handle oleh environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
        };

        if (jsonSchema) {
            payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: jsonSchema
            };
        }

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const result = await fetchWithRetry(apiUrl, options);
        
        const candidate = result.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            if (jsonSchema) {
                try {
                    return JSON.parse(candidate.content.parts[0].text);
                } catch (e) {
                    console.error("Gagal mem-parsing JSON dari API:", e);
                    throw new Error("API mengembalikan JSON yang tidak valid.");
                }
            }
            return candidate.content.parts[0].text; // Mengembalikan teks HTML
        } else {
            console.error("Respons API tidak valid:", result);
            throw new Error("Respons dari API tidak valid atau kosong.");
        }
    }

    /**
     * Memanggil Gemini API untuk pemahaman gambar (Vision).
     */
    async function callGeminiVisionAPI(userPrompt, systemInstruction, base64ImageData, jsonSchema = null) {
        const apiKey = ""; // Dibiarkan kosong
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{
                parts: [
                    { text: userPrompt },
                    { inlineData: { mimeType: "image/jpeg", data: base64ImageData } }
                ]
            }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
        };
        
        if (jsonSchema) {
            payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: jsonSchema
            };
        }

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const result = await fetchWithRetry(apiUrl, options);
        
        const candidate = result.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
             if (jsonSchema) {
                try {
                    return JSON.parse(candidate.content.parts[0].text);
                } catch (e) {
                    console.error("Gagal mem-parsing JSON dari API Vision:", e);
                    throw new Error("API Vision mengembalikan JSON yang tidak valid.");
                }
            }
            return candidate.content.parts[0].text;
        } else {
            console.error("Respons API Vision tidak valid:", result);
            throw new Error("Respons dari API Vision tidak valid atau kosong.");
        }
    }

    /**
     * Memanggil Imagen API untuk generasi gambar.
     */
    async function callImagenAPI(prompt) {
        const apiKey = ""; // Dibiarkan kosong
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
        
        const payload = {
            instances: [{ prompt: prompt }],
            parameters: { sampleCount: 1 }
        };

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const result = await fetchWithRetry(apiUrl, options);

        if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
            return result.predictions[0].bytesBase64Encoded; // Mengembalikan string base64
        } else {
            console.error("Respons API Imagen tidak valid:", result);
            throw new Error("Respons dari API Imagen tidak valid atau kosong.");
        }
    }

    // --- (BARU) FUNGSI HELPER UNTUK TTS ---

    /**
     * Memanggil Gemini TTS API.
     * Mengembalikan data audio base64 (raw PCM).
     */
    async function callGeminiTTS_API(text, voiceName = 'Kore') {
        const apiKey = ""; // Dibiarkan kosong
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const result = await fetchWithRetry(apiUrl, options);
        
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;

        if (audioData) {
            return audioData;
        } else {
            console.error("Respons API TTS tidak valid:", result);
            throw new Error("Respons dari API TTS tidak valid atau kosong.");
        }
    }

    /**
     * Mengubah string Base64 ke ArrayBuffer.
     */
    function base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Mengubah data PCM mentah menjadi Blob WAV.
     */
    function pcmToWav(pcmData, sampleRate) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = pcmData.length * bitsPerSample / 8;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');
        // fmt chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // Audio format (1 = PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        // data chunk
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Write PCM data
        let offset = 44;
        for (let i = 0; i < pcmData.length; i++, offset += 2) {
            view.setInt16(offset, pcmData[i], true);
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    // --- AKHIR FUNGSI HELPER TTS ---


    // --- Fungsi Pembantu untuk Baca File Teks ---
    function readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error("Gagal membaca file: " + e.target.error.name));
            reader.readAsText(file);
        });
    }

    // --- (BARU) Fungsi Pembantu untuk Baca Gambar sebagai Base64 ---
    function readImageAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // e.target.result adalah data URL (data:image/jpeg;base64,...)
                // Kita hanya butuh string base64-nya saja
                const base64String = e.target.result.split(',')[1];
                resolve({
                    base64: base64String,
                    dataUrl: e.target.result // Simpan juga data URL untuk pratinjau
                });
            };
            reader.onerror = (e) => reject(new Error("Gagal membaca file gambar: " + e.target.error.name));
            reader.readAsDataURL(file); // Baca sebagai Data URL
        });
    }


    // --- Logika Form Modul Ajar ---
    const formModulAjar = document.getElementById('form-modul-ajar');
    const loadingSpinner = document.getElementById('loading-spinner');
    const hasilModul = document.getElementById('hasil-modul');
    const hasilModulContent = document.getElementById('hasil-modul-content');
    const buatModulBtn = document.getElementById('buat-modul-btn');
    let selectedBukuFile = null;

    const lihatModulBtn = document.getElementById('lihat-modul-btn');
    const unduhModulBtn = document.getElementById('unduh-modul-btn');
    const cetakModulBtn = document.getElementById('cetak-modul-btn');

    if (formModulAjar) {
        formModulAjar.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const mapel = document.getElementById('mapel').value;
            const jenjang = document.getElementById('jenjang').value;
            const materi = document.getElementById('materi').value;
            const tujuan = document.getElementById('tujuan').value;
            const waktu = document.getElementById('waktu').value;
            const bab = document.getElementById('bab').value;
            const file = selectedBukuFile; 
            
            let fileContent = "";
            if (file) {
                try {
                    fileContent = await readTextFile(file);
                } catch (error) {
                    showNotification(error.message, true);
                    return;
                }
            }

            loadingSpinner.style.display = 'flex';
            hasilModul.style.display = 'none';
            buatModulBtn.disabled = true;
            buatModulBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membuat...';

            // --- PANGGILAN GEMINI API ---
            try {
                const systemInstruction = `Anda adalah seorang ahli desainer kurikulum dan guru senior di Indonesia yang ahli dalam Kurikulum Merdeka. Tugas Anda adalah membuat draf Modul Ajar (RPP) yang sangat lengkap, rinci, dan siap pakai.
Format output Anda HARUS berupa HTML bersih, gunakan tag <p>, <ul>, <li>, <h4>, dan <table> untuk merapikan. JANGAN gunakan tag <html>, <head>, atau <body>.
Draf harus mencakup 14 poin berikut secara detail, menggunakan data yang diberikan:
1. Identitas Modul Ajar (Isi semua data yang diketahui)
2. Capaian Pembelajaran (CP) (Tulis CP yang relevan untuk fase dan mapel)
3. Tujuan Pembelajaran (TP) (Gunakan kata kerja operasional Bloom)
4. Keterkaitan Profil Pelajar Pancasila (Jelaskan indikator P5)
5. Karakteristik Peserta Didik
6. Materi Pembelajaran (Uraikan konsep utama, fakta, contoh. Jika diberi naskah, ringkas di sini)
7. Model, Pendekatan & Metode Pembelajaran
8. Media, Alat & Bahan
9. Langkah-Langkah Pembelajaran (Sintaks) (Sangat rinci: Pendahuluan, Inti, Penutup)
10. Asesmen / Penilaian (Diagnostik, Formatif, Sumatif, lengkap dengan CONTOH rubrik dalam <table>)
11. Pengayaan dan Remedial
12. Profil Risiko & Mitigasi Mengajar
13. Glosarium (Istilah penting)
14. Daftar Pustaka (Termasuk file yang diupload jika ada)`;

                const userPrompt = `
Data untuk Modul Ajar:
- Mata Pelajaran: ${mapel || 'Belum ditentukan'}
- Jenjang/Kelas: ${jenjang || 'Belum ditentukan'}
- Topik/Materi: ${materi || 'Belum ditentukan'}
- Tujuan Pembelajaran (dari input): ${tujuan || 'Belum ditentukan, buatkan beberapa yang relevan'}
- Alokasi Waktu: ${waktu || 'Belum ditentukan'}
- Bab/Bagian Relevan: ${bab || 'Tidak ada'}
- Konten dari file .txt (jika ada): ${fileContent ? fileContent.substring(0, 3000) + "..." : "Tidak ada"}

Buatkan draf Modul Ajar HTML yang lengkap berdasarkan data di atas.`;

                const htmlResult = await callGeminiAPI(userPrompt, systemInstruction);

                loadingSpinner.style.display = 'none';
                hasilModul.style.display = 'block';
                hasilModulContent.innerHTML = htmlResult; // Langsung masukkan HTML dari API
                showNotification('Modul Ajar berhasil dibuat oleh AI!');

            } catch (error) {
                loadingSpinner.style.display = 'none';
                showNotification(`Error: ${error.message}`, true);
                console.error(error);
            } finally {
                buatModulBtn.disabled = false;
                buatModulBtn.innerHTML = '<i class="fas fa-magic"></i> ✨ Buat Modul';
            }
        });
    }
    
    function getModulContentForPrint() {
        const mapel = document.getElementById('mapel').value || "Modul";
        const content = hasilModulContent.innerHTML;
        const styles = `
            body { font-family: 'Inter', sans-serif; padding: 20px; line-height: 1.6; }
            h3 { text-align: center; margin-bottom: 20px; }
            h4 { color: #7c5cff; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;}
            hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
            .table, table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; text-align: left; margin-top: 10px; }
            .table th, .table td, table th, table td { padding: 8px; border: 1px solid #ddd; }
            .table thead tr, table thead tr { background-color: #f9f9f9; }
            @media print {
                body { padding: 0; }
                h4 { page-break-after: avoid; }
                table { page-break-inside: auto; }
            }
        `;
        return { content, styles, mapel };
    }

    if (lihatModulBtn) {
        lihatModulBtn.addEventListener('click', () => {
            const { content, styles, mapel } = getModulContentForPrint();
            const newWindow = window.open();
            newWindow.document.write(`
                <html>
                    <head><title>Pratinjau Modul Ajar - ${mapel}</title><style>${styles}</style></head>
                    <body>${content}</body>
                </html>
            `);
            newWindow.document.close();
        });
    }

    if (unduhModulBtn) {
        unduhModulBtn.addEventListener('click', () => {
            const { content, styles, mapel } = getModulContentForPrint();
            const fullHtml = `
                <!DOCTYPE html><html lang="id">
                <head><meta charset="UTF-8"><title>Modul Ajar - ${mapel}</title><style>${styles}</style></head>
                <body>${content}</body></html>
            `;
            const fileName = `Modul Ajar - ${mapel.replace(/[^a-z0-9]/gi, '_')}.html`;
            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            showNotification('Modul Ajar berhasil diunduh.');
        });
    }

    if (cetakModulBtn) {
        cetakModulBtn.addEventListener('click', () => {
            const { content, styles, mapel } = getModulContentForPrint();
            const newWindow = window.open();
            newWindow.document.write(`
                <html>
                    <head><title>Cetak Modul Ajar - ${mapel}</title><style>${styles}</style></head>
                    <body>${content}</body>
                </html>
            `);
            newWindow.document.close();
            newWindow.onload = () => {
                newWindow.print();
                newWindow.close();
            };
        });
    }

    // --- Logika Upload Buku (Modul Ajar) ---
    const dragDropArea = document.getElementById('buku-drag-drop-area');
    const pdfUploadInput = document.getElementById('buku-upload-input');
    const browsePdfBtn = document.getElementById('browse-buku-btn');
    const fileNameDisplay = document.getElementById('buku-file-name-display');

    if (dragDropArea) {
        dragDropArea.addEventListener('click', (e) => {
            if (e.target.id === 'browse-buku-btn' || e.target === dragDropArea || e.target.tagName === 'I' || e.target.tagName === 'H3' || e.target.tagName === 'P') {
                if (!selectedBukuFile) {
                     pdfUploadInput.click();
                }
            }
        });
        pdfUploadInput.addEventListener('change', () => {
            if (pdfUploadInput.files.length > 0) handleFile(pdfUploadInput.files[0]);
        });
        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragDropArea.classList.add('drag-over');
        });
        dragDropArea.addEventListener('dragleave', () => {
            dragDropArea.classList.remove('drag-over');
        });
        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFile(files[0]);
        });
    }

    function handleFile(file) {
        if (!file) {
            selectedBukuFile = null;
            fileNameDisplay.textContent = '';
            return;
        }
        const allowedTypes = ['text/plain']; // HANYA .TXT
        if (!allowedTypes.includes(file.type)) {
            showNotification('Gagal: File harus .txt untuk dibaca oleh AI.', true);
            selectedBukuFile = null;
            fileNameDisplay.textContent = '';
            return;
        }
        selectedBukuFile = file;
        fileNameDisplay.textContent = `File terpilih: ${file.name}`;
        showNotification('File .txt berhasil dipilih.');
    }


    // --- (BARU) LOGIKA UNTUK BAHAN AJAR ---

    const formBahanAjar = document.getElementById('form-bahan-ajar');
    const loadingSpinnerBahanAjar = document.getElementById('loading-spinner-bahan-ajar');
    const hasilBahanAjarCard = document.getElementById('hasil-bahan-ajar-card');
    const generateBahanAjarBtn = document.getElementById('generate-bahan-ajar-btn');
    const hapusBahanAjarTeksBtn = document.getElementById('hapus-bahan-ajar-teks-btn');
    const bahanAjarTeksMateri = document.getElementById('bahan-ajar-teks-materi');
    let selectedBahanAjarSemester = '1';
    let selectedBahanAjarFile = null;

    // Hapus Teks
    if (hapusBahanAjarTeksBtn) {
        hapusBahanAjarTeksBtn.addEventListener('click', () => {
            bahanAjarTeksMateri.value = '';
            showNotification('Teks materi dihapus.');
        });
    }

    // Logika Tombol Semester
    const bahanAjarSemesterButtons = document.querySelectorAll('#bahan-ajar-semester-selector .semester-btn');
    bahanAjarSemesterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            bahanAjarSemesterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBahanAjarSemester = btn.dataset.semester;
        });
    });

    // Logika Upload Teks (.txt)
    const bahanAjarDragDropArea = document.getElementById('bahan-ajar-drag-drop-area');
    const bahanAjarUploadInput = document.getElementById('bahan-ajar-upload-input');
    const browseBahanAjarBtn = document.getElementById('browse-bahan-ajar-btn');
    const bahanAjarFileNameDisplay = document.getElementById('bahan-ajar-file-name-display');

    if (bahanAjarDragDropArea) {
        bahanAjarDragDropArea.addEventListener('click', (e) => {
            if (e.target.id === 'browse-bahan-ajar-btn' || e.target === bahanAjarDragDropArea || e.target.tagName === 'I' || e.target.tagName === 'H3' || e.target.tagName === 'P') {
                if (!selectedBahanAjarFile) {
                     bahanAjarUploadInput.click();
                }
            }
        });
        bahanAjarUploadInput.addEventListener('change', () => {
            if (bahanAjarUploadInput.files.length > 0) handleBahanAjarFile(bahanAjarUploadInput.files[0]);
        });
        bahanAjarDragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            bahanAjarDragDropArea.classList.add('drag-over');
        });
        bahanAjarDragDropArea.addEventListener('dragleave', () => {
            bahanAjarDragDropArea.classList.remove('drag-over');
        });
        bahanAjarDragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            bahanAjarDragDropArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleBahanAjarFile(files[0]);
        });
    }

    function handleBahanAjarFile(file) {
        if (!file) {
            selectedBahanAjarFile = null;
            bahanAjarFileNameDisplay.textContent = '';
            return;
        }
        if (file.type !== 'text/plain') {
            showNotification('Gagal: File harus .txt.', true);
            selectedBahanAjarFile = null;
            bahanAjarFileNameDisplay.textContent = '';
            return;
        }
        selectedBahanAjarFile = file;
        bahanAjarFileNameDisplay.textContent = `File terpilih: ${file.name}`;
        showNotification('File .txt berhasil dipilih.');
    }

    // Submit Form "Bahan Ajar"
    if (formBahanAjar) {
        formBahanAjar.addEventListener('submit', async (e) => {
            e.preventDefault();

            const teksMateri = bahanAjarTeksMateri.value;
            let fileContent = "";
            
            if (selectedBahanAjarFile) {
                try {
                    fileContent = await readTextFile(selectedBahanAjarFile);
                } catch (error) {
                    showNotification(error.message, true);
                    return;
                }
            }
            
            const gabunganTeks = teksMateri + "\n\n" + fileContent;

            if (gabunganTeks.trim().length < 50) {
                showNotification('Gagal: Harap tempelkan teks materi atau upload file .txt (minimal 50 karakter).', true);
                return;
            }

            // Ambil semua nilai
            const jenjang = document.getElementById('bahan-ajar-jenjang').value;
            const semester = selectedBahanAjarSemester;
            const instruksi = document.getElementById('bahan-ajar-instruksi').value;
            
            const buat = {
                ringkasan: document.getElementById('toggle-ringkasan').checked,
                outline: document.getElementById('toggle-outline').checked,
                kuis: document.getElementById('toggle-kuis').checked,
                diskusi: document.getElementById('toggle-diskusi').checked,
                istilah: document.getElementById('toggle-istilah').checked,
                studiKasus: document.getElementById('toggle-studi-kasus').checked,
                analogi: document.getElementById('toggle-analogi').checked,
                naskahVideo: document.getElementById('toggle-naskah-video').checked,
            };

            const isAnyToggleOn = Object.values(buat).some(v => v);
            if (!isAnyToggleOn) {
                 showNotification('Gagal: Harap pilih setidaknya satu output bahan ajar.', true);
                return;
            }

            // Tampilkan loading
            loadingSpinnerBahanAjar.style.display = 'flex';
            hasilBahanAjarCard.style.display = 'none';
            generateBahanAjarBtn.disabled = true;
            generateBahanAjarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membuat...';

            // --- PANGGILAN GEMINI API (JSON) ---
            try {
                const systemInstruction = `Anda adalah Asisten Guru AI yang ahli dalam mengolah naskah materi menjadi bahan ajar yang beragam. Tugas Anda adalah membuat output berdasarkan naskah dan instruksi.
Anda HARUS mengembalikan respons dalam format JSON yang valid sesuai skema.
Semua output teks harus dalam format teks biasa (plaintext) yang rapi, gunakan newline (\n) untuk pemisah baris jika perlu.`;
                
                const userPrompt = `
Naskah Materi (Gabungan Teks Tempel dan File .txt):
"""
${gabunganTeks.substring(0, 4000)}...
"""

Pengaturan:
- Kelas: ${jenjang || 'Tentukan dari naskah'}
- Semester: ${semester}
- Instruksi Tambahan: ${instruksi || 'Tidak ada'}

Tugas: Buatkan item berikut berdasarkan naskah di atas. Jika toggle 'false', kembalikan string kosong ("") untuk item tersebut.
- Buat Ringkasan Materi: ${buat.ringkasan}
- Buat Outline Presentasi: ${buat.outline}
- Buat Kuis Cek Pemahaman: ${buat.kuis}
- Buat Pertanyaan Diskusi: ${buat.diskusi}
- Buat Daftar Istilah (Glosarium): ${buat.istilah}
- Buat Studi Kasus / Contoh: ${buat.studiKasus}
- Buat Analogi (ELI5): ${buat.analogi}
- Buat Naskah Video Pendek: ${buat.naskahVideo}

Buatkan JSON lengkapnya.
- 'materi' dan 'kelas' HARUS disimpulkan dari naskah.
- Semua output harus dalam bentuk string teks biasa (plaintext).
`;

                const jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        "materi": { "type": "STRING", "description": "Topik materi utama, disimpulkan dari naskah." },
                        "kelas": { "type": "STRING", "description": "Jenjang/Kelas yang sesuai, disimpulkan dari naskah." },
                        "ringkasan": { "type": "STRING", "description": "Ringkasan materi (plaintext)." },
                        "outline_presentasi": { "type": "STRING", "description": "Poin-poin outline presentasi (plaintext)." },
                        "kuis_pemahaman": { "type": "STRING", "description": "Kuis singkat (PG atau isian) (plaintext)." },
                        "pertanyaan_diskusi": { "type": "STRING", "description": "Pertanyaan diskusi terbuka (plaintext)." },
                        "daftar_istilah": { "type": "STRING", "description": "Daftar istilah penting dan definisinya (plaintext)." },
                        "studi_kasus": { "type": "STRING", "description": "Contoh studi kasus atau penerapan (plaintext)." },
                        "analogi_eli5": { "type": "STRING", "description": "Analogi atau penjelasan sederhana (ELI5) (plaintext)." },
                        "naskah_video": { "type": "STRING", "description": "Naskah singkat untuk video pembelajaran (plaintext)." }
                    },
                    required: ["materi", "kelas", "ringkasan", "outline_presentasi", "kuis_pemahaman", "pertanyaan_diskusi", "daftar_istilah", "studi_kasus", "analogi_eli5", "naskah_video"]
                };

                const resultJson = await callGeminiAPI(userPrompt, systemInstruction, jsonSchema);

                // --- 1. Isi Output (Fungsi Helper) ---
                // Helper untuk mengisi 1 item output
                function populateOutputItem(id_container, id_p, resultText, title) {
                    const container = document.getElementById(id_container);
                    const p = document.getElementById(id_p);
                    if (!container || !p) return;

                    const content = resultText || "-";
                    const hasContent = resultText && resultText.trim() !== "";
                    
                    p.textContent = content;
                    
                    const item = p.closest('.output-item');
                    if (item) {
                        item.querySelector('.btn-view-text').dataset.copyContent = content;
                        item.querySelector('.btn-copy').dataset.copyContent = content;
                        const downloadBtn = item.querySelector('.btn-download-txt');
                        downloadBtn.dataset.copyContent = content;
                        downloadBtn.dataset.title = title;
                    }
                    
                    // Tampilkan/sembunyikan container berdasarkan apakah ada konten
                    container.style.display = hasContent ? 'flex' : 'none';
                }
                
                // --- 2. Panggil Helper untuk Semua Item ---
                populateOutputItem('output-bahan-ajar-kelas-container', 'output-bahan-ajar-kelas', resultJson.kelas, 'Kelas');
                populateOutputItem('output-bahan-ajar-materi-container', 'output-bahan-ajar-materi', resultJson.materi, 'Materi');
                populateOutputItem('output-bahan-ajar-ringkasan-container', 'output-bahan-ajar-ringkasan', resultJson.ringkasan, 'Ringkasan');
                populateOutputItem('output-bahan-ajar-outline-container', 'output-bahan-ajar-outline', resultJson.outline_presentasi, 'Outline_Presentasi');
                populateOutputItem('output-bahan-ajar-kuis-container', 'output-bahan-ajar-kuis', resultJson.kuis_pemahaman, 'Kuis_Pemahaman');
                populateOutputItem('output-bahan-ajar-diskusi-container', 'output-bahan-ajar-diskusi', resultJson.pertanyaan_diskusi, 'Pertanyaan_Diskusi');
                populateOutputItem('output-bahan-ajar-istilah-container', 'output-bahan-ajar-istilah', resultJson.daftar_istilah, 'Daftar_Istilah');
                populateOutputItem('output-bahan-ajar-studi-kasus-container', 'output-bahan-ajar-studi-kasus', resultJson.studi_kasus, 'Studi_Kasus');
                populateOutputItem('output-bahan-ajar-analogi-container', 'output-bahan-ajar-analogi', resultJson.analogi_eli5, 'Analogi_ELI5');
                populateOutputItem('output-bahan-ajar-naskah-video-container', 'output-bahan-ajar-naskah-video', resultJson.naskah_video, 'Naskah_Video');

                loadingSpinnerBahanAjar.style.display = 'none';
                hasilBahanAjarCard.style.display = 'block';
                showNotification('Bahan Ajar berhasil dibuat oleh AI!');

            } catch (error) {
                loadingSpinnerBahanAjar.style.display = 'none';
                showNotification(`Error: ${error.message}`, true);
                console.error(error);
            } finally {
                generateBahanAjarBtn.disabled = false;
                generateBahanAjarBtn.innerHTML = '<i class="fas fa-cogs"></i> ✨ Generate Bahan Ajar';
            }
        });
    }


    // --- (MODIFIKASI) LOGIKA UNTUK BUAT SOAL ---

    const formBuatSoal = document.getElementById('form-buat-soal');
    const loadingSpinnerSoal = document.getElementById('loading-spinner-soal');
    const hasilSoalCard = document.getElementById('hasil-soal-card');
    const generateSoalBtn = document.getElementById('generate-soal-btn');
    const teksMateriInput = document.getElementById('teks-materi-input');
    let selectedSoalSemester = '1'; // Variabel state untuk semester
    const simpanKeBankBtn = document.getElementById('simpan-ke-bank-soal-btn');

    // Logika Tombol Semester untuk "Buat Soal"
    const soalSemesterButtons = document.querySelectorAll('#soal-semester-selector .semester-btn');
    soalSemesterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            soalSemesterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSoalSemester = btn.dataset.semester; // Update state saat diklik
        });
    });

    // Logika Submit Form "Buat Soal"
    if (formBuatSoal) {
        formBuatSoal.addEventListener('submit', async (e) => {
            e.preventDefault();

            const teksMateri = teksMateriInput.value;
            if (teksMateri.trim().length < 50) {
                showNotification('Gagal: Harap masukkan teks materi yang cukup (minimal 50 karakter).', true);
                return;
            }

            // Ambil semua nilai
            const jumlahPg = document.getElementById('jumlah-pg').value || 0;
            const jumlahIsian = document.getElementById('jumlah-isian').value || 0;
            const jumlahUraian = document.getElementById('jumlah-uraian').value || 0;
            const instruksi = document.getElementById('instruksi-tambahan').value;
            const semester = selectedSoalSemester;
            
            const buatKisi = document.getElementById('toggle-kisi-kisi').checked;
            const buatSoal = document.getElementById('toggle-lembar-soal').checked;
            const buatJawaban = document.getElementById('toggle-lembar-jawaban').checked;
            
            if (jumlahPg == 0 && jumlahIsian == 0 && jumlahUraian == 0) {
                showNotification('Gagal: Harap tentukan jumlah soal yang akan dibuat.', true);
                return;
            }

            // Tampilkan loading
            loadingSpinnerSoal.style.display = 'flex';
            hasilSoalCard.style.display = 'none';
            simpanKeBankBtn.style.display = 'none'; // Sembunyikan tombol simpan
            latestSoalResult = null; // Reset data lama
            generateSoalBtn.disabled = true;
            generateSoalBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membuat...';
            
            // --- PANGGILAN GEMINI API (JSON) ---
            try {
                const systemInstruction = `Anda adalah seorang guru ahli dan pembuat soal ulangan. Tugas Anda adalah membuat set soal LENGKAP berdasarkan naskah materi yang diberikan.
Anda HARUS mengembalikan respons dalam format JSON yang valid sesuai skema yang disediakan.
Semua output HTML harus bersih, menggunakan tag <p>, <ul>, <li>, <h4>, dan <table>. JANGAN gunakan tag <html> atau <body>.`;
                
                const userPrompt = `
Naskah Materi:
"""
${teksMateri.substring(0, 4000)}...
"""

Instruksi Pembuatan Soal:
- Jumlah Soal Pilihan Ganda: ${jumlahPg}
- Jumlah Soal Isian: ${jumlahIsian}
- Jumlah Soal Uraian: ${jumlahUraian}
- Semester: ${semester}
- Instruksi Tambahan: ${instruksi || 'Tidak ada'}
- Buat Kisi-Kisi: ${buatKisi}
- Buat Lembar Soal: ${buatSoal}
- Buat Lembar Jawaban: ${buatJawaban}

Buatkan JSON lengkapnya.
- Untuk 'materi' dan 'kelas', simpulkan dari naskah.
- Untuk 'kisi_html', buat tabel 8 kolom yang mendetail.
- Untuk 'soal_html', format PG dalam 2 kolom (gunakan class 'lembar-soal-pg'), Isian 1 kolom, Uraian 1 kolom.
- Untuk 'jawaban_html', format PG dalam 5 kolom (gunakan class 'lembar-jawaban-pg'), Isian 1 kolom, Uraian 1 kolom dengan spasi.
- (PENTING) Untuk 'soal_json', buat array JSON terstruktur berisi SEMUA soal (PG, Isian, Uraian) dengan 'tipe', 'soal', dan 'jawaban' (kunci jawaban).
`;

                // (MODIFIKASI) Menambahkan 'soal_json' ke skema
                const jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        "materi": { "type": "STRING" },
                        "kelas": { "type": "STRING" },
                        "soal_dibuat": { "type": "STRING" },
                        "kunci_dibuat": { "type": "STRING" },
                        "kisi_html": { "type": "STRING" },
                        "soal_html": { "type": "STRING" },
                        "jawaban_html": { "type": "STRING" },
                        // (BARU) Properti untuk menyimpan data terstruktur
                        "soal_json": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "tipe": { "type": "STRING", "description": "Tipe soal (Pilihan Ganda, Isian, Uraian)" },
                                    "soal": { "type": "STRING", "description": "Teks pertanyaan soal" },
                                    "jawaban": { "type": "STRING", "description": "Kunci jawaban untuk soal ini" }
                                },
                                "required": ["tipe", "soal", "jawaban"]
                            }
                        }
                    },
                    required: ["materi", "kelas", "soal_dibuat", "kunci_dibuat", "kisi_html", "soal_html", "jawaban_html", "soal_json"]
                };

                const resultJson = await callGeminiAPI(userPrompt, systemInstruction, jsonSchema);

                // --- 1. Isi Output Sederhana ---
                const outMateri = document.getElementById('output-soal-materi');
                if (outMateri) outMateri.textContent = resultJson.materi;
                const viewMateri = outMateri.closest('.output-item').querySelector('.btn-view-text');
                if (viewMateri) viewMateri.dataset.copyContent = resultJson.materi;
                const copyMateri = outMateri.closest('.output-item').querySelector('.btn-copy');
                if (copyMateri) copyMateri.dataset.copyContent = resultJson.materi;

                const outKelas = document.getElementById('output-soal-kelas');
                if (outKelas) outKelas.textContent = resultJson.kelas;
                const viewKelas = outKelas.closest('.output-item').querySelector('.btn-view-text');
                if (viewKelas) viewKelas.dataset.copyContent = resultJson.kelas;
                const copyKelas = outKelas.closest('.output-item').querySelector('.btn-copy');
                if (copyKelas) copyKelas.dataset.copyContent = resultJson.kelas;
                
                const outSoal = document.getElementById('output-soal-soal');
                if (outSoal) outSoal.textContent = resultJson.soal_dibuat;
                const viewSoal = outSoal.closest('.output-item').querySelector('.btn-view-text');
                if (viewSoal) viewSoal.dataset.copyContent = resultJson.soal_dibuat;
                const copySoal = outSoal.closest('.output-item').querySelector('.btn-copy');
                if (copySoal) copySoal.dataset.copyContent = resultJson.soal_dibuat;
               
                const outKunci = document.getElementById('output-soal-kunci');
                if (outKunci) outKunci.textContent = resultJson.kunci_dibuat;
                const viewKunci = outKunci.closest('.output-item').querySelector('.btn-view-text');
                if (viewKunci) viewKunci.dataset.copyContent = resultJson.kunci_dibuat;
                const copyKunci = outKunci.closest('.output-item').querySelector('.btn-copy');
                if (copyKunci) copyKunci.dataset.copyContent = resultJson.kunci_dibuat;

                // --- 2. Isi Output Dokumen ---
                const kisiContainer = document.getElementById('output-kisi-kisi');
                if (buatKisi) {
                    kisiContainer.style.display = 'block';
                    document.getElementById('preview-kisi-kisi').innerHTML = resultJson.kisi_html;
                } else {
                    kisiContainer.style.display = 'none';
                }

                const soalContainer = document.getElementById('output-lembar-soal');
                if (buatSoal) {
                    soalContainer.style.display = 'block';
                    document.getElementById('preview-lembar-soal').innerHTML = resultJson.soal_html;
                } else {
                    soalContainer.style.display = 'none';
                }

                const jawabanContainer = document.getElementById('output-lembar-jawaban');
                if (buatJawaban) {
                    jawabanContainer.style.display = 'block';
                    document.getElementById('preview-lembar-jawaban').innerHTML = resultJson.jawaban_html;
                } else {
                    jawabanContainer.style.display = 'none';
                }
                
                // (BARU) Simpan hasil JSON ke variabel global dan tampilkan tombol
                if (resultJson.soal_json && resultJson.soal_json.length > 0) {
                    latestSoalResult = resultJson; // Simpan seluruh hasil
                    simpanKeBankBtn.style.display = 'inline-flex';
                }
                
                loadingSpinnerSoal.style.display = 'none';
                hasilSoalCard.style.display = 'block';
                showNotification('Set Soal berhasil dibuat oleh AI!');

            } catch (error) {
                loadingSpinnerSoal.style.display = 'none';
                showNotification(`Error: ${error.message}`, true);
                console.error(error);
            } finally {
                generateSoalBtn.disabled = false;
                generateSoalBtn.innerHTML = '<i class="fas fa-cogs"></i> ✨ Generate Soal';
            }
        });
    }
    // --- AKHIR LOGIKA BUAT SOAL ---

    // --- (BARU) LOGIKA UNTUK BANK SOAL ---
    
    // Database (LocalStorage) helper
    function getBankSoalDB() {
        try {
            return JSON.parse(localStorage.getItem(BANK_SOAL_DB_KEY) || '[]');
        } catch (e) {
            console.error("Gagal parse Bank Soal DB:", e);
            return [];
        }
    }

    function saveBankSoalDB(db) {
        localStorage.setItem(BANK_SOAL_DB_KEY, JSON.stringify(db));
    }

    // Fungsi untuk me-render daftar soal di bank
    function renderBankSoal(items) {
        const listContainer = document.getElementById('bank-soal-list-container');
        const emptyState = document.getElementById('bank-soal-empty-state');
        if (!listContainer || !emptyState) return;
        
        listContainer.innerHTML = ''; // Kosongkan
        
        if (!items || items.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            items.forEach(item => {
                const soalElement = document.createElement('div');
                soalElement.className = 'bank-soal-item';
                soalElement.innerHTML = `
                    <input type="checkbox" class="bank-soal-item-checkbox" data-id="${item.id}">
                    <div class="bank-soal-item-content">
                        <p>${item.soal}</p>
                        <div class="bank-soal-item-tags">
                            <span class="bank-soal-tag mapel">${item.kelas}</span>
                            <span class="bank-soal-tag">${item.materi}</span>
                            <span class="bank-soal-tag tipe">${item.tipe}</span>
                        </div>
                    </div>
                    <div class="bank-soal-item-actions">
                        <button class="btn btn-danger-outline btn-sm btn-delete-soal" data-id="${item.id}" title="Hapus">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(soalElement);
            });
        }
    }
    
    // Fungsi untuk memuat dan mem-filter soal dari bank
    function loadBankSoal() {
        const db = getBankSoalDB();
        
        const searchTerm = document.getElementById('bank-soal-search').value.toLowerCase();
        const filterKelas = document.getElementById('bank-soal-filter-kelas').value;
        const filterMateri = document.getElementById('bank-soal-filter-materi').value;
        const filterTipe = document.getElementById('bank-soal-filter-tipe').value;

        const filteredDB = db.filter(item => {
            const matchesSearch = searchTerm === '' || 
                                  item.soal.toLowerCase().includes(searchTerm) || 
                                  item.materi.toLowerCase().includes(searchTerm);
            const matchesKelas = filterKelas === '' || item.kelas === filterKelas;
            const matchesMateri = filterMateri === '' || item.materi === filterMateri;
            const matchesTipe = filterTipe === '' || item.tipe === filterTipe;
            
            return matchesSearch && matchesKelas && matchesMateri && matchesTipe;
        });
        
        renderBankSoal(filteredDB);
        updateBankSoalFilters(db); // Update dropdown filter
    }

    // Fungsi untuk mengisi dropdown filter berdasarkan data di bank
    function updateBankSoalFilters(db) {
        const kelasSet = new Set(db.map(item => item.kelas));
        const materiSet = new Set(db.map(item => item.materi));

        const filterKelas = document.getElementById('bank-soal-filter-kelas');
        const filterMateri = document.getElementById('bank-soal-filter-materi');
        
        // Simpan nilai yang sedang dipilih
        const selectedKelas = filterKelas.value;
        const selectedMateri = filterMateri.value;

        // Kosongkan opsi (kecuali "Semua")
        filterKelas.innerHTML = '<option value="">Semua Kelas</option>';
        filterMateri.innerHTML = '<option value="">Semua Materi</option>';

        kelasSet.forEach(kelas => {
            const option = document.createElement('option');
            option.value = kelas;
            option.textContent = kelas;
            filterKelas.appendChild(option);
        });

        materiSet.forEach(materi => {
            const option = document.createElement('option');
            option.value = materi;
            option.textContent = materi;
            filterMateri.appendChild(option);
        });
        
        // Kembalikan nilai yang dipilih
        filterKelas.value = selectedKelas;
        filterMateri.value = selectedMateri;
    }

    // Fungsi untuk menyimpan soal baru ke bank
    function saveSoalToBank() {
        if (!latestSoalResult || !latestSoalResult.soal_json) {
            showNotification('Gagal: Tidak ada data soal untuk disimpan.', true);
            return;
        }
        
        const db = getBankSoalDB();
        const { materi, kelas, soal_json } = latestSoalResult;
        
        let soalBaruCount = 0;
        soal_json.forEach(item => {
            const newSoal = {
                id: crypto.randomUUID(),
                materi: materi || 'Umum',
                kelas: kelas || 'Umum',
                tipe: item.tipe || 'Lainnya',
                soal: item.soal,
                jawaban: item.jawaban
            };
            db.push(newSoal);
            soalBaruCount++;
        });

        saveBankSoalDB(db);
        showNotification(`${soalBaruCount} soal berhasil disimpan ke Bank Soal!`);
        
        // Reset
        latestSoalResult = null;
        simpanKeBankBtn.style.display = 'none';
        
        // Muat ulang bank soal jika sedang dilihat
        if (document.getElementById('bank-soal').classList.contains('active')) {
            loadBankSoal();
        }
    }

    // Fungsi untuk menghapus soal dari bank
    function deleteSoalFromBank(id) {
        let db = getBankSoalDB();
        db = db.filter(item => item.id !== id);
        saveBankSoalDB(db);
        showNotification('Soal berhasil dihapus.');
        loadBankSoal(); // Render ulang daftar
    }

    // Event Listener untuk tombol "Simpan ke Bank Soal"
    if (simpanKeBankBtn) {
        simpanKeBankBtn.addEventListener('click', saveSoalToBank);
    }

    // Event Listener untuk filter Bank Soal
    document.getElementById('bank-soal-search').addEventListener('input', loadBankSoal);
    document.getElementById('bank-soal-filter-kelas').addEventListener('change', loadBankSoal);
    document.getElementById('bank-soal-filter-materi').addEventListener('change', loadBankSoal);
    document.getElementById('bank-soal-filter-tipe').addEventListener('change', loadBankSoal);

    // Event Listener (delegasi) untuk tombol hapus di Bank Soal
    document.getElementById('bank-soal-list-container').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-soal');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            deleteSoalFromBank(id);
        }
    });

    // Muat bank soal saat pertama kali halaman dimuat (jika tab-nya aktif)
    if (document.getElementById('bank-soal').classList.contains('active')) {
        loadBankSoal();
    }
    // --- AKHIR LOGIKA BANK SOAL ---


    // --- (BARU) LOGIKA UNTUK KOREKSI SOAL ---
    const formKoreksiSoal = document.getElementById('form-koreksi-soal');
    const loadingSpinnerKoreksi = document.getElementById('loading-spinner-koreksi');
    const hasilKoreksiCard = document.getElementById('hasil-koreksi-card');
    const generateKoreksiBtn = document.getElementById('generate-koreksi-btn');
    const kunciJawabanInput = document.getElementById('kunci-jawaban-input');
    const hapusKunciBtn = document.getElementById('hapus-kunci-btn');

    const koreksiDragDropArea = document.getElementById('koreksi-drag-drop-area');
    const koreksiUploadInput = document.getElementById('koreksi-upload-input');
    const browseKoreksiBtn = document.getElementById('browse-koreksi-btn');
    const koreksiPreviewContainer = document.getElementById('koreksi-preview-container');
    const koreksiPreviewImg = document.getElementById('koreksi-preview-img');
    const hapusKoreksiBtn = document.getElementById('hapus-koreksi-btn');
    const previewKoreksiLembar = document.getElementById('preview-koreksi-lembar');
    
    let selectedKoreksiBase64 = null; // Menyimpan string base64
    let selectedKoreksiDataUrl = null; // Menyimpan data URL untuk pratinjau

    if (hapusKunciBtn) {
        hapusKunciBtn.addEventListener('click', () => {
            kunciJawabanInput.value = '';
            showNotification('Kunci jawaban dihapus.');
        });
    }

    function handleKoreksiFile(file) {
        if (!file) {
            selectedKoreksiBase64 = null;
            selectedKoreksiDataUrl = null;
            koreksiPreviewContainer.style.display = 'none';
            koreksiDragDropArea.style.display = 'block';
            return;
        }
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            showNotification('Gagal: File harus .jpg atau .png.', true);
            return;
        }
        
        readImageAsBase64(file).then(result => {
            selectedKoreksiBase64 = result.base64;
            selectedKoreksiDataUrl = result.dataUrl;
            
            koreksiPreviewImg.src = result.dataUrl;
            koreksiDragDropArea.style.display = 'none';
            koreksiPreviewContainer.style.display = 'block';
            
            // Juga tampilkan di kartu hasil
            previewKoreksiLembar.innerHTML = `<img src="${result.dataUrl}" alt="Lembar Jawaban Asli">`;
            
            showNotification('Gambar lembar jawaban berhasil dimuat.');
        }).catch(error => {
            showNotification(error.message, true);
        });
    }

    if (koreksiDragDropArea) {
        koreksiDragDropArea.addEventListener('click', (e) => {
            if (e.target.id === 'browse-koreksi-btn' || e.target === koreksiDragDropArea || e.target.tagName === 'I' || e.target.tagName === 'H3' || e.target.tagName === 'P') {
                koreksiUploadInput.click();
            }
        });
        koreksiUploadInput.addEventListener('change', () => {
            if (koreksiUploadInput.files.length > 0) handleKoreksiFile(koreksiUploadInput.files[0]);
        });
        koreksiDragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            koreksiDragDropArea.classList.add('drag-over');
        });
        koreksiDragDropArea.addEventListener('dragleave', () => {
            koreksiDragDropArea.classList.remove('drag-over');
        });
        koreksiDragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            koreksiDragDropArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleKoreksiFile(files[0]);
        });
    }
    
    if (hapusKoreksiBtn) {
        hapusKoreksiBtn.addEventListener('click', () => {
            handleKoreksiFile(null); // Reset
            koreksiUploadInput.value = ''; // Hapus file dari input
        });
    }

    if (formKoreksiSoal) {
        formKoreksiSoal.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const kunciJawaban = kunciJawabanInput.value;
            if (kunciJawaban.trim().length < 5) {
                showNotification('Gagal: Harap masukkan kunci jawaban yang valid.', true);
                return;
            }
            if (!selectedKoreksiBase64) {
                showNotification('Gagal: Harap upload gambar lembar jawaban siswa.', true);
                return;
            }

            loadingSpinnerKoreksi.style.display = 'flex';
            hasilKoreksiCard.style.display = 'none';
            generateKoreksiBtn.disabled = true;
            generateKoreksiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengoreksi...';

            // --- PANGGILAN GEMINI VISION API (JSON) ---
            try {
                const systemInstruction = `Anda adalah Asisten Guru AI (OCR) yang sangat teliti. Tugas Anda adalah mengoreksi lembar jawaban siswa (gambar) berdasarkan kunci jawaban (teks).
Bandingkan jawaban siswa di gambar dengan kunci jawaban.
Kembalikan jawaban dalam format JSON yang valid.
- 'nomor_salah': Daftar nomor yang salah (misal: "3, 5, 9").
- 'nomor_benar': Daftar nomor yang benar (misal: "1, 2, 4, 6, 7, 8, 10").
- 'nilai': String nilai akhir (misal: "80/100").`;

                const userPrompt = `
Kunci Jawaban:
"""
${kunciJawaban}
"""

Tugas:
1. Baca jawaban siswa dari gambar yang diupload.
2. Bandingkan dengan Kunci Jawaban di atas.
3. Tentukan nomor mana yang BENAR dan nomor mana yang SALAH.
4. Hitung nilai akhir siswa (skala /100).
5. Kembalikan hasilnya dalam format JSON.
`;
                const jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        "nomor_salah": { "type": "STRING" },
                        "nomor_benar": { "type": "STRING" },
                        "nilai": { "type": "STRING" }
                    },
                    required: ["nomor_salah", "nomor_benar", "nilai"]
                };

                const resultJson = await callGeminiVisionAPI(userPrompt, systemInstruction, selectedKoreksiBase64, jsonSchema);

                // --- 1. Isi Output Sederhana ---
                const outSalah = document.getElementById('output-koreksi-salah');
                if (outSalah) outSalah.textContent = resultJson.nomor_salah || "Tidak ada";
                const viewSalah = outSalah.closest('.output-item').querySelector('.btn-view-text');
                if (viewSalah) viewSalah.dataset.copyContent = resultJson.nomor_salah || "Tidak ada";
                const copySalah = outSalah.closest('.output-item').querySelector('.btn-copy');
                if (copySalah) copySalah.dataset.copyContent = resultJson.nomor_salah || "Tidak ada";
                
                const outBenar = document.getElementById('output-koreksi-benar');
                if (outBenar) outBenar.textContent = resultJson.nomor_benar || "Tidak ada";
                const viewBenar = outBenar.closest('.output-item').querySelector('.btn-view-text');
                if (viewBenar) viewBenar.dataset.copyContent = resultJson.nomor_benar || "Tidak ada";
                const copyBenar = outBenar.closest('.output-item').querySelector('.btn-copy');
                if (copyBenar) copyBenar.dataset.copyContent = resultJson.nomor_benar || "Tidak ada";

                const outNilai = document.getElementById('output-koreksi-nilai');
                if (outNilai) outNilai.textContent = resultJson.nilai || "0/100";
                const viewNilai = outNilai.closest('.output-item').querySelector('.btn-view-text');
                if (viewNilai) viewNilai.dataset.copyContent = resultJson.nilai || "0/100";
                const copyNilai = outNilai.closest('.output-item').querySelector('.btn-copy');
                if (copyNilai) copyNilai.dataset.copyContent = resultJson.nilai || "0/100";

                // --- 2. Isi Output Dokumen (Sudah diisi saat upload) ---
                // Tampilkan kartu hasil
                loadingSpinnerKoreksi.style.display = 'none';
                hasilKoreksiCard.style.display = 'block';
                showNotification('Koreksi berhasil dibuat oleh AI!');

            } catch (error) {
                loadingSpinnerKoreksi.style.display = 'none';
                showNotification(`Error: ${error.message}`, true);
                console.error(error);
            } finally {
                generateKoreksiBtn.disabled = false;
                generateKoreksiBtn.innerHTML = '<i class="fas fa-check-double"></i> ✨ Generate Koreksi';
            }
        });
    }
    // --- AKHIR LOGIKA KOREKSI SOAL ---


    // --- (BARU) LOGIKA UNTUK MEDIA AJAR ---
    const formMediaAjar = document.getElementById('form-media-ajar');
    const loadingSpinnerMedia = document.getElementById('loading-spinner-media');
    const hasilMediaCard = document.getElementById('hasil-media-card');
    const generateMediaBtn = document.getElementById('generate-media-btn');
    const naskahVideoInput = document.getElementById('naskah-video-input');
    const hapusNaskahBtn = document.getElementById('hapus-naskah-btn');
    const naskahPreviewArea = document.getElementById('naskah-preview-area');
    const hasilGambarGrid = document.getElementById('hasil-gambar-grid');

    if (hapusNaskahBtn) {
        hapusNaskahBtn.addEventListener('click', () => {
            naskahVideoInput.value = '';
            naskahPreviewArea.innerHTML = '<p style="color: var(--gray-light);">Naskah Anda akan tampil di sini...</p>';
            showNotification('Naskah video dihapus.');
        });
    }

    if (naskahVideoInput) {
        naskahVideoInput.addEventListener('input', () => {
            const text = naskahVideoInput.value;
            if (text) {
                naskahPreviewArea.textContent = text;
            } else {
                naskahPreviewArea.innerHTML = '<p style="color: var(--gray-light);">Naskah Anda akan tampil di sini...</p>';
            }
        });
    }

    if (formMediaAjar) {
        formMediaAjar.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const naskah = naskahVideoInput.value;
            if (naskah.trim().length < 20) {
                showNotification('Gagal: Harap masukkan naskah yang cukup (minimal 20 karakter).', true);
                return;
            }

            const instruksi = document.getElementById('instruksi-tambahan-media').value;
            const buatGambar = document.getElementById('toggle-buat-gambar').checked;
            const buatAudio = document.getElementById('toggle-split-audio').checked;

            if (!buatGambar && !buatAudio) {
                showNotification('Gagal: Harap pilih setidaknya satu output (gambar atau audio).', true);
                return;
            }

            loadingSpinnerMedia.style.display = 'flex';
            hasilMediaCard.style.display = 'none';
            hasilGambarGrid.innerHTML = ''; // Kosongkan hasil lama
            generateMediaBtn.disabled = true;
            generateMediaBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mem-parsing...';

            // --- PANGGILAN GEMINI API (JSON) - TAHAP 1: PARSING NASKAH ---
            try {
                const systemInstruction = `Anda adalah Asisten Sutradara AI. Tugas Anda adalah mem-parsing naskah video (yang dipisahkan oleh "Adegan ...:") menjadi daftar adegan.
Untuk setiap adegan:
1. Ekstrak judul adegan (misal: "Adegan 1").
2. Ekstrak narasi (teks yang akan diucapkan).
3. BUATKAN prompt gambar yang sangat deskriptif dan sinematik untuk Imagen, berdasarkan narasi dan instruksi.
Kembalikan HANYA array JSON yang valid.`;

                const userPrompt = `
Naskah:
"""
${naskah}
"""

Instruksi Tambahan (Gaya): ${instruksi || 'Tidak ada'}

Parse naskah di atas menjadi array JSON dengan format:
[{"adegan": "...", "narasi": "...", "prompt_gambar": "..."}, ...]
`;

                const jsonSchema = {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            "adegan": { "type": "STRING" },
                            "narasi": { "type": "STRING" },
                            "prompt_gambar": { "type": "STRING" }
                        },
                        required: ["adegan", "narasi", "prompt_gambar"]
                    }
                };
                
                const adeganList = await callGeminiAPI(userPrompt, systemInstruction, jsonSchema);
                
                if (!adeganList || adeganList.length === 0) {
                    throw new Error("Naskah tidak dapat di-parsing. Pastikan formatnya benar (misal: 'Adegan 1: ...')");
                }

                // --- TAHAP 2: GENERASI ASET (GAMBAR & AUDIO) ---
                generateMediaBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Membuat Aset (0/${adeganList.length})...`;
                hasilMediaCard.style.display = 'block'; // Tampilkan kartu hasil

                let count = 0;
                const assetPromises = adeganList.map(async (adegan) => {
                    let imageUrl = 'https://placehold.co/600x400/f0f0f0/999999?text=Gambar';
                    let audioUrl = null;

                    try {
                        // 1. Buat Gambar (Jika dicentang)
                        if (buatGambar) {
                            const imageBase64 = await callImagenAPI(adegan.prompt_gambar);
                            imageUrl = `data:image/png;base64,${imageBase64}`;
                        }

                        // 2. Buat Audio (Jika dicentang)
                        if (buatAudio && adegan.narasi) {
                            const audioBase64 = await callGeminiTTS_API(adegan.narasi, 'Kore'); // Menggunakan suara 'Kore'
                            const pcmData = base64ToArrayBuffer(audioBase64);
                            const pcm16 = new Int16Array(pcmData);
                            const wavBlob = pcmToWav(pcm16, 24000); // Gemini TTS menggunakan 24kHz
                            audioUrl = URL.createObjectURL(wavBlob);
                        }
                    } catch (err) {
                        console.error(`Gagal membuat aset untuk ${adegan.adegan}:`, err);
                    }
                    
                    count++;
                    generateMediaBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Membuat Aset (${count}/${adeganList.length})...`;
                    
                    return { ...adegan, imageUrl, audioUrl };
                });

                // Tunggu semua aset selesai
                const assets = await Promise.all(assetPromises);

                // --- TAHAP 3: RENDER HASIL ---
                assets.forEach(asset => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'image-output-item';
                    
                    itemEl.innerHTML = `
                        <img src="${asset.imageUrl}" alt="${asset.adegan}">
                        <div class="image-output-item-content">
                            <h5>${asset.adegan}</h5>
                            <p>${asset.narasi}</p>
                            ${asset.audioUrl ? `<audio controls src="${asset.audioUrl}"></audio>` : ''}
                            <div class="image-output-actions">
                                <button class="btn btn-outline btn-sm btn-media-preview" data-src="${asset.imageUrl}">
                                    <i class="fas fa-eye"></i> Lihat
                                </button>
                                <button class="btn btn-success btn-sm btn-media-download" data-src="${asset.imageUrl}" data-title="${asset.adegan.replace(/[^a-z0-9]/gi, '_')}.png">
                                    <i class="fas fa-download"></i> Unduh
                                </button>
                            </div>
                        </div>
                    `;
                    hasilGambarGrid.appendChild(itemEl);
                });

                loadingSpinnerMedia.style.display = 'none';
                showNotification('Aset media berhasil dibuat!');

            } catch (error) {
                loadingSpinnerMedia.style.display = 'none';
                showNotification(`Error: ${error.message}`, true);
                console.error(error);
            } finally {
                generateMediaBtn.disabled = false;
                generateMediaBtn.innerHTML = '<i class="fas fa-film"></i> ✨ Generate Aset Video';
            }
        });
    }
    // --- AKHIR LOGIKA MEDIA AJAR ---


    // --- (PERBAIKAN) FUNGSI GLOBAL CLICK HANDLER ---

    // --- Helper Function untuk Salin ke Clipboard (METODE STABIL) ---
    function copyToClipboard(text) {
        // Metode Fallback (document.execCommand) yang lebih andal di iframe
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed'; // Hindari scroll
        textArea.style.opacity = 0;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('Teks berhasil disalin!');
        } catch (err) {
            showNotification('Gagal menyalin teks.', true);
            console.error('Gagal menyalin (fallback): ', err);
        }
        document.body.removeChild(textArea);
    }

    // --- Event Listener Global untuk Tombol Aksi (DIGABUNG) ---
    document.body.addEventListener('click', (e) => {
        
        // 1. Tombol Salin (dari Bahan Ajar, Buat Soal, Koreksi Soal)
        const copyButton = e.target.closest('.btn-copy');
        if (copyButton) {
            const content = copyButton.dataset.copyContent;
            if(content && content !== '-') {
                copyToClipboard(content);
            } else {
                showNotification('Tidak ada konten untuk disalin.', true);
            }
            return; // Hentikan eksekusi
        }

        // 2. Tombol Lihat Teks (dari Bahan Ajar, Buat Soal, Koreksi Soal)
        const viewButton = e.target.closest('.btn-view-text');
        if (viewButton) {
             const content = viewButton.dataset.copyContent;
             if (content && content !== '-') {
                 const newWindow = window.open();
                 newWindow.document.write(`<pre style="font-family: Inter, sans-serif; word-wrap: break-word; white-space: pre-wrap; padding: 20px;">${content}</pre>`);
                 newWindow.document.close();
             } else {
                showNotification('Tidak ada konten untuk dilihat.', true);
             }
             return; // Hentikan eksekusi
        }

        // 3. Tombol Unduh Teks (dari Bahan Ajar)
        const downloadTxtButton = e.target.closest('.btn-download-txt');
        if (downloadTxtButton) {
            const content = downloadTxtButton.dataset.copyContent;
            const title = downloadTxtButton.dataset.title || 'Bahan_Ajar';
            if (content && content !== '-') {
                const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showNotification(`${title} berhasil diunduh.`);
            } else {
                showNotification('Tidak ada konten untuk diunduh.', true);
            }
            return; // Hentikan eksekusi
        }

        // 4. Tombol Aksi Dokumen (Lihat/Unduh/Cetak HTML dari Buat Soal & Koreksi)
        const targetButton = e.target.closest('.btn-doc-action');
        if (targetButton) {
            const action = targetButton.dataset.action;
            const targetId = targetButton.dataset.target;
            const title = targetButton.dataset.title;
            
            const { content, styles, isImage } = getDocContent(targetId);
            if (!content) return; 

            const fullHtml = `
                <!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
                <title>${title}</title><style>${styles}</style></head>
                <body>${content}</body></html>
            `;

            if (action === 'lihat') {
                const newWindow = window.open();
                newWindow.document.write(fullHtml);
                newWindow.document.close();
            } else if (action === 'unduh' && !isImage) { // Unduh hanya untuk non-gambar (HTML)
                const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.html`;
                const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showNotification(`${title} berhasil diunduh.`);
            } else if (action === 'cetak') {
                const newWindow = window.open();
                newWindow.document.write(fullHtml);
                newWindow.document.close();
                newWindow.onload = () => {
                    newWindow.print();
                };
            }
            return; // Hentikan eksekusi
        }
        
        // 5. Tombol Aksi Media (dari Media Ajar)
        const previewBtn = e.target.closest('.btn-media-preview');
        if (previewBtn) {
            const src = previewBtn.dataset.src;
            if (src) {
                const newWindow = window.open();
                newWindow.document.write(`<body style="margin:0; background: #333;"><img src="${src}" style="width: 100%; height: auto; display: block; margin: auto;"></body>`);
                newWindow.document.close();
            }
            return; // Hentikan eksekusi
        }

        const downloadBtn = e.target.closest('.btn-media-download');
        if (downloadBtn) {
            const src = downloadBtn.dataset.src;
            const title = downloadBtn.dataset.title || 'gambar.png';
            if (src) {
                const link = document.createElement('a');
                link.href = src;
                link.download = title; 
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            return; // Hentikan eksekusi
        }
    });

    // --- Helper Function untuk Aksi Dokumen (Lihat, Unduh, Cetak) ---
    function getDocContent(targetId) {
        const contentEl = document.getElementById(targetId);
        if (!contentEl) return { content: '', styles: '', isImage: false };
        
        // Cek apakah targetnya adalah pratinjau koreksi (yang berisi gambar)
        if (targetId === 'preview-koreksi-lembar') {
            const imgEl = contentEl.querySelector('img');
            if (imgEl && imgEl.src) {
                return {
                    content: `<img src="${imgEl.src}" style="width: 100%;">`,
                    styles: `body { margin: 0; } @media print { body { padding: 0; } img { max-width: 100vw; } }`,
                    isImage: true
                };
            }
            return { content: '', styles: '', isImage: false }; // Jika tidak ada gambar
        }

        // Logika default untuk HTML (seperti kisi-kisi dan lembar soal)
        const content = contentEl.innerHTML;
        const styles = `
            body { font-family: 'Inter', sans-serif; padding: 20px; line-height: 1.6; }
            h3 { text-align: center; margin-bottom: 5px; }
            h4 { margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            p { margin-bottom: 10px; }
            .table-responsive { overflow-x: auto; }
            .table, table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; text-align: left; font-size: 12px; margin-top: 10px; }
            .table th, .table td, table th, table td { padding: 6px; border: 1px solid #ddd; }
            .table thead tr, table thead tr { background-color: #f9f9f9; }
            .lembar-soal-pg { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
            .lembar-soal-pg .soal-item, .lembar-soal-isian .soal-item, .lembar-soal-uraian .soal-item { margin-bottom: 15px; }
            .lembar-jawaban-pg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
            .lembar-jawaban-pg .jawaban-item, .lembar-jawaban-isian .jawaban-item, .lembar-jawaban-uraian .jawaban-item { margin-bottom: 10px; }
            .lembar-jawaban-isian .jawaban-item { display: flex; gap: 10px; }
            .lembar-jawaban-isian span { flex: 1; border-bottom: 1px solid #999; }
            .lembar-jawaban-uraian .jawaban-item { border-bottom: 1px solid #ccc; padding-bottom: 60px; }
            @media print {
                body { padding: 0; font-size: 10pt; }
                h3 { margin-bottom: 15px; }
                .lembar-soal-pg { grid-template-columns: 1fr 1fr; }
                .lembar-jawaban-pg { grid-template-columns: repeat(5, 1fr); }
                table { page-break-inside: auto; }
            }
        `;
        return { content, styles, isImage: false };
    }

});
