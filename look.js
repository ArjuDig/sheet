        const SECRET_CODE = "Z2Vyb2JhZzEy"; 

        // Fungsi membuat Token Unik
        function generateToken(name, school) {
            if(!name || !school) return "";
            // Logic: Gabungkan Nama (lowercase, tanpa spasi) + Sekolah (lowercase, tanpa spasi) + Secret Code Base64
            const cleanName = name.toLowerCase().replace(/\s/g, '');
            const cleanSchool = school.toLowerCase().replace(/\s/g, '');
            
            const rawString = cleanName + cleanSchool + SECRET_CODE;
            
            // Simple encoding to create a "code-like" string
            // Kita encode lagi hasil gabungan tadi menjadi Base64, lalu ambil 8 karakter pertama & uppercase
            try {
                return btoa(rawString).substring(0, 8).toUpperCase();
            } catch (e) {
                // Fallback for special chars if btoa fails
                return "ERR-CODE";
            }
        }

        function checkPass() {
            const nameInput = document.getElementById('app-user').value;
            const schoolInput = document.getElementById('app-school').value;
            const codeInput = document.getElementById('app-pass').value;
            const errorMsg = document.getElementById('error-msg');
            
            if(!nameInput || !schoolInput || !codeInput) {
                errorMsg.innerText = "Harap isi Nama, Sekolah, dan Kode Aktivasi!";
                errorMsg.style.display = 'block';
                return;
            }

            const validCode = generateToken(nameInput, schoolInput);
            
            if(codeInput === validCode) {
                document.getElementById('security-overlay').style.display = 'none';
                sessionStorage.setItem('isLoggedIn', 'true');
                // Store user data to session so it persists on refresh
                sessionStorage.setItem('userName', nameInput);
                sessionStorage.setItem('userSchool', schoolInput);
                
                // Apply profile settings (fill & lock)
                applyProfileLock(nameInput, schoolInput);
                
            } else {
                errorMsg.innerText = "Kode Aktivasi Salah! Periksa Nama dan Sekolah Anda.";
                errorMsg.style.display = 'block';
                document.getElementById('app-pass').value = '';
            }
        }
        
        // Function to apply locked profile settings
        function applyProfileLock(name, school) {
            // Update Dashboard UI
            document.getElementById('user-name-display').innerText = name;
            document.getElementById('dash-name').innerText = name;
            document.getElementById('user-initial').innerText = name.charAt(0).toUpperCase();

            // Lock Profile Fields
            const nameField = document.getElementById('p-nama');
            const schoolField = document.getElementById('p-sekolah');

            if(nameField) {
                nameField.value = name;
                nameField.setAttribute('readonly', true);
                nameField.style.backgroundColor = '#f1f5f9'; // Grey out to indicate disabled/locked
                nameField.style.cursor = 'not-allowed';
                nameField.title = "Data dikunci dari login";
            }

            if(schoolField) {
                schoolField.value = school;
                schoolField.setAttribute('readonly', true);
                schoolField.style.backgroundColor = '#f1f5f9';
                schoolField.style.cursor = 'not-allowed';
                schoolField.title = "Data dikunci dari login";
            }
        }

        // Check session on load
        if(sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('security-overlay').style.display = 'none';
            // Retrieve saved data and re-apply lock
            const savedName = sessionStorage.getItem('userName') || 'Guru';
            const savedSchool = sessionStorage.getItem('userSchool') || '';
            applyProfileLock(savedName, savedSchool);
        }

        // Allow Enter key
        document.getElementById('app-pass').addEventListener("keypress", function(event) {
            if (event.key === "Enter") checkPass();
        });
