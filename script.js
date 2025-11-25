        const apiKey = ""; // Disuntikkan saat runtime

        // --- UTILS ---
        function showToast(message) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerText = message;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        async function callGemini(prompt, systemInstruction = "You are a helpful teaching assistant.") {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        systemInstruction: { parts: [{ text: systemInstruction }] }
                    })
                });
                const data = await response.json();
                if(data.error) throw new Error(data.error.message);
                return data.candidates[0].content.parts[0].text;
            } catch (error) {
                console.error(error);
                showToast("Error API: " + error.message);
                return "Maaf, terjadi kesalahan saat menghubungi AI.";
            }
        }

        async function callImagen(prompt) {
             try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: prompt }],
                        parameters: { sampleCount: 1 }
                    })
                });
                const data = await response.json();
                if(data.error) throw new Error(data.error.message);
                const base64 = data.predictions[0].bytesBase64Encoded;
                return `data:image/png;base64,${base64}`;
            } catch (error) {
                console.error(error);
                showToast("Error Imagen: " + error.message);
                return null;
            }
        }
        
        // --- TTS API Call ---
        async function callTTS(text, voice) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: text }] }],
                        generationConfig: { 
                            responseModalities: ["AUDIO"],
                            speechConfig: { 
                                voiceConfig: { 
                                    prebuiltVoiceConfig: { voiceName: voice } 
                                } 
                            } 
                        }
                    })
                });
                const data = await response.json();
                if(data.error) throw new Error(data.error.message);
                return data.candidates[0].content.parts[0].inlineData.data; // Base64 PCM
            } catch (error) {
                console.error(error);
                showToast("Error TTS: " + error.message);
                return null;
            }
        }

        function base64ToArrayBuffer(base64) {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function pcmToWav(pcmData, sampleRate = 24000) {
            const numChannels = 1;
            const bitsPerSample = 16;
            const byteRate = sampleRate * numChannels * bitsPerSample / 8;
            const blockAlign = numChannels * bitsPerSample / 8;
            const dataSize = pcmData.byteLength;
            const headerSize = 44;
            const buffer = new ArrayBuffer(headerSize + dataSize);
            const view = new DataView(buffer);

            function writeString(view, offset, string) {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            }

            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + dataSize, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true); 
            view.setUint16(20, 1, true); 
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitsPerSample, true);
            writeString(view, 36, 'data');
            view.setUint32(40, dataSize, true);

            const pcmBytes = new Uint8Array(pcmData);
            const wavBytes = new Uint8Array(buffer, 44);
            wavBytes.set(pcmBytes);

            return buffer;
        }
        
        function cleanAndParseJSON(str) {
            try {
                // Find first open bracket and last close bracket
                const firstOpen = str.indexOf('{');
                const lastClose = str.lastIndexOf('}');
                
                if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
                    let jsonCandidate = str.substring(firstOpen, lastClose + 1);
                    return JSON.parse(jsonCandidate);
                }
                return null;
            } catch (e) {
                console.error("JSON Parse Error:", e);
                return null;
            }
        }

        // --- NAVIGATION ---
        function switchSection(targetId) {
            document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.menu-item, .nav-item').forEach(el => el.classList.remove('active'));
            
            const targetSection = document.getElementById(targetId);
            if(targetSection) targetSection.classList.add('active');
            
            // Sidebar active state
            document.querySelectorAll(`[data-target="${targetId}"]`).forEach(el => el.classList.add('active'));
            
            // Close mobile sidebar if open
            document.getElementById('sidebar').classList.remove('open');
            
            // Update Title
            const titleMap = {
                'dashboard': 'Dashboard',
                'pengaturan': 'Profil Guru',
                'materi-ajar': 'Generator Modul Ajar',
                'bahan-ajar': 'Generator Media Ajar', 
                'kokurikuler': 'Projek Kokurikuler', 
                'soal': 'Asesmen & Evaluasi',
                'media-ajar': 'Visual & Audio Generator', // Updated Title
                'rubrik-penilaian': 'Rubrik Penilaian',
                'rapor-siswa': 'E-Rapor',
                'analisis-hasil': 'Analisis Nilai',
                'rekomendasi-materi': 'Rekomendasi Belajar',
                'ice-breaker': 'Ice Breaker',
                'bank-soal': 'Bank Soal'
            };
            document.getElementById('page-title').innerText = titleMap[targetId] || 'ArhamSheet';
        }

        document.querySelectorAll('.menu-item, .nav-item').forEach(item => {
            item.addEventListener('click', function() {
                const target = this.getAttribute('data-target');
                switchSection(target);
            });
        });

        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // --- THEME & PROFILE ---
        const darkModeBtn = document.getElementById('toggle-dark-mode');
        darkModeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
            darkModeBtn.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        });

        function loadProfile() {
            const nama = localStorage.getItem('as_nama') || 'Guru';
            const sekolah = localStorage.getItem('as_sekolah') || 'Nama Sekolah';
            document.getElementById('user-name-display').innerText = nama;
            document.getElementById('dash-name').innerText = nama;
            document.getElementById('user-initial').innerText = nama.charAt(0);
            document.getElementById('p-nama').value = localStorage.getItem('as_nama') || '';
            document.getElementById('p-nip').value = localStorage.getItem('as_nip') || '';
            document.getElementById('p-sekolah').value = sekolah;
            if(document.getElementById('out-sekolah')) document.getElementById('out-sekolah').innerText = sekolah.toUpperCase();
        }

        document.getElementById('btn-save-profile').addEventListener('click', () => {
            localStorage.setItem('as_nama', document.getElementById('p-nama').value);
            localStorage.setItem('as_nip', document.getElementById('p-nip').value);
            localStorage.setItem('as_sekolah', document.getElementById('p-sekolah').value);
            showToast('Profil berhasil disimpan');
            loadProfile();
        });
        
        loadProfile();

        // --- FILE UPLOAD UI ---
        document.querySelectorAll('.upload-box').forEach(box => {
            const input = box.querySelector('input[type="file"]');
            const badge = box.querySelector('.file-badge');
            box.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                if(input.files.length > 0) {
                    badge.style.display = 'inline-block';
                    badge.innerText = input.files[0].name;
                    box.classList.add('has-file');
                }
            });
        });

        // --- MODUL AJAR LOGIC ---
        // Toggle Kurikulum
        const kurikulumBtns = document.querySelectorAll('#modul-kurikulum-group .btn-toggle');
        let selectedKurikulum = "Kurikulum Merdeka";
        kurikulumBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                kurikulumBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedKurikulum = btn.getAttribute('data-value');
                document.getElementById('modul-kurikulum-kustom').style.display = selectedKurikulum === 'Kustom' ? 'block' : 'none';
            });
        });

        document.getElementById('btn-gen-modul').addEventListener('click', async function() {
            const btn = this;
            const mapel = document.getElementById('modul-mapel').value;
            if(!mapel) return showToast("Mohon isi Mata Pelajaran/Topik");

            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Sedang Membuat...';
            
            // Collect Data
            const profilLulusan = Array.from(document.querySelectorAll('.check-profil:checked')).map(c => c.value).join(", ");
            const components = {
                pendekatan: document.getElementById('check-pendekatan').checked,
                lkpd: document.getElementById('check-lkpd').checked,
                glosarium: document.getElementById('check-glosarium').checked,
                media: document.getElementById('check-media').checked
            };

            const prompt = `
            Buatkan Modul Ajar Lengkap untuk:
            Mata Pelajaran: ${mapel}
            Kurikulum: ${selectedKurikulum === 'Kustom' ? document.getElementById('modul-kurikulum-kustom').value : selectedKurikulum}
            Fase/Kelas: ${document.getElementById('modul-fase-select').value}
            Alokasi Waktu: ${document.getElementById('modul-waktu').value}
            Model Pembelajaran: ${document.getElementById('modul-model-select').value}
            Profil Pelajar Pancasila: ${profilLulusan}
            
            Instruksi Khusus: ${document.getElementById('modul-instruksi').value}
            
            Struktur Modul harus mencakup:
            1. Informasi Umum
            2. Komponen Inti (Tujuan, Pemahaman Bermakna, Pertanyaan Pemantik)
            3. Kegiatan Pembelajaran (Pendahuluan, Inti, Penutup)
            ${components.lkpd ? '4. Lampiran LKPD (Lembar Kerja Peserta Didik)' : ''}
            ${components.glosarium ? '5. Glosarium' : ''}
            
            Format output dalam Markdown yang rapi. Gunakan tabel jika perlu.
            `;

            const result = await callGemini(prompt, "Anda adalah asisten pendidikan ahli yang membuat modul ajar profesional.");
            
            document.getElementById('res-modul-content').innerHTML = marked.parse(result);
            document.getElementById('res-modul').style.display = 'block';
            document.getElementById('stat-generated').innerText = parseInt(document.getElementById('stat-generated').innerText) + 1;
            
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-magic"></i> Buat Modul dengan AI';
            // Scroll to result
            document.getElementById('res-modul').scrollIntoView({ behavior: 'smooth' });
        });

        // --- BAHAN AJAR (MEDIA AJAR) LOGIC ---
        
        // Toggle Audio Settings
        document.getElementById('check-audio').addEventListener('change', function() {
            document.getElementById('audio-settings').style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('btn-gen-bahan').addEventListener('click', async function() {
            const btn = this;
            const topik = document.getElementById('bahan-topik').value;
            if(!topik) return showToast("Mohon isi Topik Materi");

            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Memproses...';
            
            // Check new switches
            const needsVisual = document.getElementById('check-visual').checked;
            const needsAudio = document.getElementById('check-audio').checked;
            const audioStyle = document.getElementById('audio-voice-style').value;

            const prompt = `
            Buatkan Media Ajar Kreatif untuk topik: "${topik}".
            Saya butuh output komponen terpisah.
            
            OUTPUT HARUS DALAM FORMAT JSON yang Valid dengan keys berikut:
            {
                "infografis": "Deskripsi visual infografis yang menarik (Markdown)",
                "peta_konsep": "Peta konsep dalam bentuk poin-poin/mermaid (Markdown)",
                "diskusi": "5 pertanyaan diskusi kritis (Markdown)",
                "pemantik": "5 pertanyaan pemantik untuk pembuka kelas (Markdown)",
                "kuis": "5 soal kuis pilihan ganda sederhana (Markdown)",
                "analogi": "Penjelasan materi menggunakan analogi sederhana (ELI5) (Markdown)",
                "ppt": "Outline Slide PowerPoint 1-5 slide (Markdown)",
                "video": "Skrip video pendek pembelajaran (Durasi 1 menit) (Markdown)",
                "visual": "5 Deskripsi adegan (scene) detail untuk ilustrasi/animasi. Buat visualisasi yang kaya. (Markdown)",
                "audio": "Naskah audio 5 segmen (Intro, Isi 1, Isi 2, Isi 3, Penutup) dengan gaya bahasa ${audioStyle}. Tuliskan narasi lengkap. (Markdown)"
            }

            Pastikan isi setiap key menggunakan format Markdown yang rapi. Jangan tambahkan teks di luar JSON. Do NOT use markdown formatting for the whole JSON response.
            `;

            try {
                const rawResult = await callGemini(prompt, "You are a JSON generator. Output valid JSON only without Markdown blocks.");
                const data = cleanAndParseJSON(rawResult);
                
                if (data) {
                    // Helper to safely set content
                    const setContent = (id, text) => {
                        const el = document.getElementById(id).querySelector('.content-body');
                        if(el) el.innerHTML = marked.parse(text || "Tidak ada konten generated.");
                    };

                    setContent('bahan-info', data.infografis);
                    setContent('bahan-peta', data.peta_konsep);
                    setContent('bahan-diskusi', data.diskusi);
                    setContent('bahan-pemantik', data.pemantik);
                    setContent('bahan-kuis', data.kuis);
                    setContent('bahan-analogi', data.analogi);
                    setContent('bahan-ppt', data.ppt);
                    setContent('bahan-video', data.video);
                    
                    // Set new contents
                    setContent('bahan-visual', data.visual);
                    setContent('bahan-audio', data.audio);

                    document.getElementById('res-bahan').style.display = 'block';
                    document.getElementById('stat-generated').innerText = parseInt(document.getElementById('stat-generated').innerText) + 1;
                } else {
                     throw new Error("Parsed JSON is null");
                }
                
            } catch (error) {
                console.error(error);
                showToast("Gagal memparsing format JSON. Menampilkan raw text.");
                // Fallback: Dump everything in first tab
                const fallbackText = await callGemini(`Buatkan materi ajar lengkap tentang ${topik}`);
                 document.getElementById('bahan-info').querySelector('.content-body').innerHTML = marked.parse(fallbackText);
                 document.getElementById('res-bahan').style.display = 'block';
            }

            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-magic"></i> Buat Media Ajar';
            document.getElementById('res-bahan').scrollIntoView({ behavior: 'smooth' });
        });

        // --- KOKURIKULER LOGIC (NEW) ---
        document.getElementById('btn-gen-kokurikuler').addEventListener('click', async function() {
            const btn = this;
            const tema = document.getElementById('kokurikuler-tema').value;
            const topik = document.getElementById('kokurikuler-topik').value;
            
            if(!topik) return showToast("Topik Projek harus diisi!");

            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Merancang Projek...';

            const prompt = `
            Buatkan Rancangan Projek Kokurikuler dengan detail berikut:
            Tema: ${tema}
            Topik Spesifik: ${topik}
            Fase: ${document.getElementById('kokurikuler-fase').value}
            Durasi: ${document.getElementById('kokurikuler-durasi').value}
            Metode: ${document.getElementById('kokurikuler-metode').value}

            OUTPUT HARUS DALAM FORMAT JSON yang Valid dengan keys berikut:
            {
                "modul": "Modul Projek Lengkap (Tujuan, Dimensi Profil Pelajar Pancasila, Target Pencapaian). Gunakan Markdown.",
                "alur": "Alur Aktivitas Projek (Pengenalan, Kontekstualisasi, Aksi, Refleksi, Tindak Lanjut). Gunakan Markdown.",
                "rubrik": "Rubrik Penilaian (Berkembang Sesuai Harapan, Sangat Berkembang, dll). Gunakan Markdown Tabel.",
                "refleksi": "Lembar Refleksi Peserta Didik dan Guru. Gunakan Markdown."
            }
            
            Pastikan isi setiap key menggunakan format Markdown yang rapi. Jangan tambahkan teks di luar JSON.
            `;

            try {
                const rawResult = await callGemini(prompt, "Output only valid JSON without Markdown blocks.");
                const data = cleanAndParseJSON(rawResult);

                if (data) {
                    const setContent = (id, text) => {
                        const el = document.getElementById(id).querySelector('.content-body');
                        if(el) el.innerHTML = marked.parse(text || "Tidak ada konten generated.");
                    };

                    setContent('kokurikuler-modul', data.modul);
                    setContent('kokurikuler-alur', data.alur);
                    setContent('kokurikuler-rubrik', data.rubrik);
                    setContent('kokurikuler-refleksi', data.refleksi);

                    document.getElementById('res-kokurikuler').style.display = 'block';
                    document.getElementById('stat-generated').innerText = parseInt(document.getElementById('stat-generated').innerText) + 1;
                } else {
                    throw new Error("Parsed JSON is null");
                }
            } catch (e) {
                console.error(e);
                showToast("Gagal memproses Kokurikuler. Coba lagi.");
                // Fallback text output if JSON fails
                const textFallback = await callGemini(prompt + " (Jawab dalam teks biasa saja)");
                document.getElementById('kokurikuler-modul').querySelector('.content-body').innerHTML = marked.parse(textFallback);
                document.getElementById('res-kokurikuler').style.display = 'block';
            }

            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-magic"></i> Buat Program Kokurikuler';
            document.getElementById('res-kokurikuler').scrollIntoView({ behavior: 'smooth' });
        });

        // --- SOAL TABS LOGIC (Sub-Tabs for Buat Soal & Koreksi) ---
        function switchSoalSubTab(tabId) {
            // Update button states
            document.getElementById('subtab-buat-soal').classList.remove('active');
            document.getElementById('subtab-koreksi-ljk').classList.remove('active');
            document.getElementById('subtab-' + tabId).classList.add('active');

            // Toggle Panels
            document.getElementById('panel-buat-soal').style.display = 'none';
            document.getElementById('panel-koreksi-ljk').style.display = 'none';
            document.getElementById('panel-' + tabId).style.display = 'block';
        }

        // --- SOAL OUTPUT TAB LOGIC (Results Tabs) ---
        // Generic Tab Switcher that works for both Soal and Bahan sections
        function openTab(evt, tabId) {
            // Find which container we are in to scope the tab switching
            const container = evt.currentTarget.closest('.doc-preview');
            
            // Hide all tab panes within this container
            const panes = container.querySelectorAll('.tab-pane');
            panes.forEach(pane => {
                pane.style.display = 'none';
                pane.classList.remove('active');
            });

            // Deactivate all tab buttons within this container
            const btns = container.querySelectorAll('.tab-btn');
            btns.forEach(btn => {
                btn.classList.remove('active');
            });

            // Show target
            const target = document.getElementById(tabId);
            if(target) {
                target.style.display = 'block';
                target.classList.add('active');
            }
            
            // Activate button
            evt.currentTarget.classList.add('active');
        }

        document.getElementById('btn-gen-soal').addEventListener('click', async function() {
            const btn = this;
            const mapel = document.getElementById('soal-mapel').value;
            if(!mapel) return showToast("Isi Mata Pelajaran!");
            
            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Membuat Paket Soal...';

            const pg = document.getElementById('soal-pg').value;
            const essay = document.getElementById('soal-essay').value;
            const hots = document.getElementById('check-hots').checked ? "Level HOTS (C4-C6)" : "Level Standar";
            
            const prompt = `
            Buatkan Paket Soal Ujian untuk:
            Mapel: ${mapel}
            Fase: ${document.getElementById('soal-fase').value}
            Jumlah PG: ${pg}
            Jumlah Uraian: ${essay}
            Tingkat Kesulitan: ${hots}
            
            OUTPUT HARUS DALAM FORMAT JSON SEPERTI INI (TANPA MARKDOWN CODE BLOCK):
            {
                "kisi_kisi": "Tabel Kisi-kisi dalam format HTML Table",
                "naskah_soal": "Naskah soal lengkap (PG dan Essay) format HTML, gunakan <ol> dan <li>",
                "kunci_jawaban": "Kunci jawaban format HTML",
                "pembahasan": "Pembahasan rinci format HTML"
            }
            Pastikan JSON valid. Do NOT use markdown formatting for the whole JSON response.
            `;

            try {
                const rawResult = await callGemini(prompt, "Output only valid JSON without Markdown blocks.");
                const data = cleanAndParseJSON(rawResult);

                if (data) {
                    document.getElementById('content-kisi').innerHTML = data.kisi_kisi || "Gagal memuat kisi-kisi";
                    document.getElementById('content-naskah').innerHTML = data.naskah_soal + "<hr><h3>Kunci Jawaban</h3>" + data.kunci_jawaban;
                    document.getElementById('content-bahas').innerHTML = data.pembahasan || "Tidak ada pembahasan";
                    
                    // Mock LJK Generator
                    let ljkHTML = '<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:20px;">';
                    for(let i=1; i<=pg; i++) {
                        ljkHTML += `<div>${i}. (A) (B) (C) (D) (E)</div>`;
                    }
                    ljkHTML += '</div><div style="margin-top:20px; border:1px solid #000; height:100px; padding:5px;">Isian/Uraian:</div>';
                    document.getElementById('content-ljk').innerHTML = ljkHTML;

                    document.getElementById('res-soal').style.display = 'block';
                    document.getElementById('stat-generated').innerText = parseInt(document.getElementById('stat-generated').innerText) + 1;
                } else {
                     throw new Error("Parsed JSON is null");
                }

            } catch(e) {
                console.error(e);
                showToast("Format JSON gagal diparsing. Mencoba format teks biasa.");
                const textResult = await callGemini(prompt + " (Format Text Biasa saja)");
                document.getElementById('content-naskah').innerHTML = marked.parse(textResult);
                document.getElementById('res-soal').style.display = 'block';
            }

            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-magic"></i> Generate Paket Soal Lengkap';
            document.getElementById('res-soal').scrollIntoView({ behavior: 'smooth' });
        });

        // --- VISUAL & AUDIO GENERATOR TABS ---
        function switchVisAudioTab(tabId) {
            document.getElementById('subtab-vis-gen').classList.remove('active');
            document.getElementById('subtab-aud-gen').classList.remove('active');
            document.getElementById('subtab-' + tabId).classList.add('active');

            document.getElementById('panel-vis-gen').style.display = 'none';
            document.getElementById('panel-aud-gen').style.display = 'none';
            document.getElementById('panel-' + tabId).style.display = 'block';
        }

        // --- MEDIA VISUAL (IMAGEN) ---
        document.getElementById('btn-gen-media').addEventListener('click', async function() {
            const btn = this;
            const p = document.getElementById('media-prompt').value;
            if(!p) return showToast("Isi deskripsi gambar");
            
            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Generating Image...';
            
            const imgUrl = await callImagen(p);
            
            if(imgUrl) {
                document.getElementById('res-media-content').innerHTML = `<img src="${imgUrl}" class="generated-image" alt="Generated Image">`;
            } else {
                document.getElementById('res-media-content').innerHTML = `<p style="color:red">Gagal membuat gambar. Coba lagi nanti.</p>`;
            }
            
            document.getElementById('res-media').style.display = 'block';
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-paint-brush"></i> Generate Ilustrasi (Imagen)';
        });

        // --- AUDIO GENERATOR (TTS) ---
        document.getElementById('btn-gen-audio').addEventListener('click', async function() {
            const btn = this;
            const text = document.getElementById('audio-prompt').value;
            const voice = document.getElementById('tts-voice').value;
            
            if(!text) return showToast("Isi teks narasi!");
            
            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner"></i> Generating Audio...';
            
            const base64PCM = await callTTS(text, voice);
            
            if(base64PCM) {
                const pcmBuffer = base64ToArrayBuffer(base64PCM);
                const wavBuffer = pcmToWav(pcmBuffer); // Convert raw PCM to WAV
                const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                const url = URL.createObjectURL(blob);
                
                document.getElementById('res-media-content').innerHTML = `
                    <div style="text-align:center; padding:20px;">
                        <i class="fas fa-headphones" style="font-size:3rem; color:var(--primary); margin-bottom:15px;"></i>
                        <h4>Audio Berhasil Dibuat!</h4>
                        <audio controls src="${url}" style="width:100%; margin-top:10px;"></audio>
                        <div style="margin-top:15px; font-size:0.9rem; color:var(--secondary);">
                            Suara: <strong>${voice}</strong>
                        </div>
                    </div>
                `;
            } else {
                document.getElementById('res-media-content').innerHTML = `<p style="color:red">Gagal membuat audio. Coba lagi nanti.</p>`;
            }
            
            document.getElementById('res-media').style.display = 'block';
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-microphone-alt"></i> Generate Audio (TTS)';
        });

        // --- KOREKSI LJK (VISION STUB) ---
        document.getElementById('btn-koreksi').addEventListener('click', function() {
            const file = document.getElementById('ljk-file-upload').files[0];
            if(!file) return showToast("Upload foto LJK dulu!");
            
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengscan...';
            setTimeout(() => {
                // Mock result because actual vision needs file reading to base64 which is lengthy for this single file constraint
                const score = Math.floor(Math.random() * (100 - 60 + 1) + 60);
                document.getElementById('res-koreksi-content').innerHTML = `
                    <h4>Hasil Scan AI</h4>
                    <p>Nama Siswa: <strong>Terdeteksi (Budi Santoso)</strong></p>
                    <p>Skor: <span style="font-size:2rem; font-weight:bold; color:var(--primary)">${score}</span> / 100</p>
                    <p>Salah: ${10 - (score/10)} nomor.</p>
                `;
                document.getElementById('res-koreksi').style.display = 'block';
                this.innerHTML = 'Mulai Koreksi';
            }, 2000);
        });

        // --- ANALISIS HASIL ---
        document.getElementById('btn-analisis').addEventListener('click', async function() {
            const nilai = document.getElementById('nilai-input').value;
            if(!nilai) return showToast("Masukkan data nilai!");
            
            this.classList.add('loading');
            const prompt = `Analisis data nilai berikut: [${nilai}]. Berikan Mean, Median, Modus, dan saran perbaikan pembelajaran bagi siswa yang nilainya di bawah rata-rata.`;
            const res = await callGemini(prompt);
            
            document.getElementById('res-analisis-content').innerHTML = marked.parse(res);
            document.getElementById('res-analisis').style.display = 'block';
            document.getElementById('stat-analyzed').innerText = parseInt(document.getElementById('stat-analyzed').innerText) + 1;
            this.classList.remove('loading');
        });

        // --- RUBRIK, REKOMENDASI, ICE BREAKER ---
        const simpleGenerators = [
            { btn: 'btn-gen-rubrik', input: 'rubrik-task', res: 'res-rubrik', content: 'res-rubrik-content', prompt: 'Buat rubrik penilaian tabel untuk tugas: ' },
            { btn: 'btn-gen-rek', input: 'rek-input', res: 'res-rekomendasi', content: 'res-rek-content', prompt: 'Berikan solusi pedagogik untuk masalah siswa: ' },
            { btn: 'btn-gen-ice', input: 'ice-input', res: 'res-icebreaker', content: 'res-ice-content', prompt: 'Berikan 3 ide ice breaker seru untuk situasi: ' }
        ];

        simpleGenerators.forEach(gen => {
            document.getElementById(gen.btn).addEventListener('click', async function() {
                const val = document.getElementById(gen.input).value;
                if(!val) return showToast("Isi input dulu!");
                
                this.classList.add('loading');
                const result = await callGemini(gen.prompt + val);
                document.getElementById(gen.content).innerHTML = marked.parse(result);
                document.getElementById(gen.res).style.display = 'block';
                this.classList.remove('loading');
            });
        });

        // --- E-RAPOR ---
        document.getElementById('btn-gen-rapor').addEventListener('click', function() {
            const nama = document.getElementById('rapor-nama').value;
            const raw = document.getElementById('rapor-nilai-raw').value;
            const note = document.getElementById('rapor-catatan').value;
            
            if(!nama) return showToast("Nama siswa wajib diisi");

            const lines = raw.split('\n');
            let table = '<table style="width:100%; border-collapse:collapse; margin-bottom:15px;"><thead><tr style="background:#f1f5f9;"><th>Mata Pelajaran</th><th>Nilai</th><th>Predikat</th></tr></thead><tbody>';
            
            lines.forEach(line => {
                const [mapel, sk] = line.split('=');
                if(mapel && sk) {
                    const score = parseInt(sk.trim());
                    let pred = 'C';
                    if(score >= 90) pred = 'A';
                    else if(score >= 80) pred = 'B';
                    table += `<tr><td>${mapel}</td><td>${score}</td><td>${pred}</td></tr>`;
                }
            });
            table += '</tbody></table>';
            
            document.getElementById('res-rapor-content').innerHTML = `
                <p><strong>Nama Siswa:</strong> ${nama}</p>
                <p><strong>Semester:</strong> Ganjil 2024/2025</p>
                ${table}
                <div style="border:1px solid #ccc; padding:10px;">
                    <strong>Catatan Wali Kelas:</strong><br>
                    ${note || "Tingkatkan terus prestasimu!"}
                </div>
                <div style="margin-top:30px; text-align:right;">
                    <p>Mengetahui,<br>Wali Kelas</p>
                    <br><br>
                    <p><u>${localStorage.getItem('as_nama') || 'Guru'}</u></p>
                </div>
            `;
            document.getElementById('res-rapor').style.display = 'block';
        });

        // --- EXPORT & MODAL UTILS ---
        window.viewOutput = function(contentId) {
            const content = document.getElementById(contentId).innerHTML;
            document.getElementById('modal-output-content').innerHTML = content;
            document.getElementById('modal-output').classList.add('open');
        };

        window.closeModal = function() {
            document.getElementById('modal-output').classList.remove('open');
        };

        window.downloadContentAsPPT = function() {
            let pptx = new PptxGenJS();
            let slide = pptx.addSlide();
            slide.addText("ArhamSheet Generated Content", { x: 1, y: 1, fontSize: 24, color: '363636' });
            slide.addText("Konten PPT masih dalam tahap pengembangan (Beta). Silakan gunakan Copy-Paste dari Word.", { x: 1, y: 2, fontSize: 14 });
            pptx.writeFile({ fileName: "ArhamSheet-Export.pptx" });
        };

        window.downloadCurrentContentAsWord = function() {
            const content = document.getElementById('modal-output-content').innerHTML;
            const converted = htmlDocx.asBlob(content);
            saveAs(converted, 'ArhamSheet-Document.docx');
        };

        window.downloadSpecificDiv = function(divId, filename) {
            const content = document.getElementById(divId).innerHTML;
            const converted = htmlDocx.asBlob(content);
            saveAs(converted, `${filename}.docx`);
        };
        
        window.downloadCurrentTabAsWord = function() {
            // Find active tab in bahan ajar (or generic context)
            // Try to find in any active section's tab pane
            const activePane = document.querySelector('.content-section.active .tab-pane.active');
            
            if(activePane) {
                const content = activePane.innerHTML;
                // Simple filename based on tab id or generic
                const filename = activePane.id ? activePane.id : 'Dokumen';
                const converted = htmlDocx.asBlob(content);
                saveAs(converted, `${filename}.docx`);
            } else {
                // Fallback if no tabs active but doc preview exists (like modul ajar)
                const activePreview = document.querySelector('.content-section.active .doc-preview');
                if(activePreview && activePreview.style.display !== 'none') {
                     // check if it has direct content div like res-modul-content
                     const contentDiv = activePreview.querySelector('[id$="-content"]');
                     if(contentDiv) {
                        const converted = htmlDocx.asBlob(contentDiv.innerHTML);
                        saveAs(converted, `Dokumen.docx`);
                     } else {
                        showToast("Tidak ada konten aktif untuk diunduh");
                     }
                } else {
                    showToast("Tidak ada konten aktif");
                }
            }
        };

        window.printSection = function(divId) {
            // Remove class 'print-area' from any existing elements
            document.querySelectorAll('.print-area').forEach(el => el.classList.remove('print-area'));
            
            // Add class to target
            const target = document.getElementById(divId);
            if(target) {
                target.classList.add('print-area');
                window.print();
                target.classList.remove('print-area');
            } else {
                console.error("Target print ID not found:", divId);
            }
        };
        
        window.clearOutput = function(elementId) {
            const el = document.getElementById(elementId);
            if(el) {
                el.style.display = 'none';
                showToast("Hasil telah ditutup.");
            }
        };

        // --- BANK SOAL ---
        window.openSaveModal = function() {
            document.getElementById('modal-save-confirm').style.display = 'flex';
        };
        window.closeSaveModal = function() {
            document.getElementById('modal-save-confirm').style.display = 'none';
        };
        window.confirmSaveToBank = function() {
            const name = document.getElementById('save-set-name').value;
            if(!name) return showToast("Nama paket harus diisi!");
            
            const bankList = document.getElementById('bank-list-container');
            const emptyMsg = bankList.querySelector('p');
            if(emptyMsg) emptyMsg.remove();
            
            const newItem = document.createElement('div');
            newItem.className = 'menu-item';
            newItem.innerHTML = `<i class="fas fa-file-alt"></i> <span>${name}</span> <span style="margin-left:auto; font-size:0.8rem; color:green;">Tersimpan</span>`;
            bankList.appendChild(newItem);
            
            document.getElementById('bank-count').innerText = parseInt(document.getElementById('bank-count').innerText) + 1;
            closeSaveModal();
            showToast("Berhasil disimpan ke Bank Soal");
        };
        window.clearBank = function() {
            document.getElementById('bank-list-container').innerHTML = '<p style="text-align:center; color:var(--text-muted);">Belum ada soal tersimpan.</p>';
            document.getElementById('bank-count').innerText = '0';
        };
