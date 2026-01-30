// WhatsApp Downloader Bot - Frontend JavaScript

// Global variables
let currentPairingCode = '';
let currentPhone = '';
let checkInterval = null;
let statsInterval = null;

// DOM Elements
const statusDiv = document.getElementById('status');
const phoneInput = document.getElementById('phoneNumber');
const generateBtn = document.getElementById('generateBtn');
const checkBtn = document.getElementById('checkBtn');
const pairingCodeDisplay = document.getElementById('pairingCode');

// Show status message
function showStatus(message, type = 'info') {
    if (!statusDiv) return;
    
    const icon = type === 'error' ? 'times-circle' : 
                 type === 'success' ? 'check-circle' : 'info-circle';
    
    const colorClass = type === 'error' ? 'red' : 
                      type === 'success' ? 'green' : 'blue';
    
    statusDiv.innerHTML = `
        <div class="flex items-start">
            <i class="fas fa-${icon} text-${colorClass}-500 mt-1 mr-3 text-lg"></i>
            <div class="flex-1">${message}</div>
            <button onclick="this.parentElement.parentElement.classList.add('hidden')" 
                    class="text-gray-500 hover:text-gray-700 ml-2">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    statusDiv.className = `mb-4 p-4 rounded-lg border-l-4 border-${colorClass}-500 bg-${colorClass}-50 text-${colorClass}-700`;
    statusDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusDiv.classList.add('hidden');
    }, 5000);
}

// Format phone number
function formatPhoneNumber(phone) {
    return `+92${phone}`;
}

// Validate phone number
function validatePhoneNumber(phone) {
    if (!phone || phone.length !== 10) {
        return { valid: false, message: 'Phone number must be 10 digits' };
    }
    
    if (!/^\d+$/.test(phone)) {
        return { valid: false, message: 'Phone number must contain only numbers' };
    }
    
    return { valid: true, message: '' };
}

// Generate pairing code
async function generatePairingCode() {
    if (!phoneInput || !generateBtn) return;
    
    const phone = phoneInput.value.trim();
    const validation = validatePhoneNumber(phone);
    
    if (!validation.valid) {
        showStatus(validation.message, 'error');
        phoneInput.focus();
        return;
    }
    
    currentPhone = phone;
    
    // Disable button and show loading
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
    generateBtn.disabled = true;
    
    try {
        const response = await fetch('/api/pair', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ phone: phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.alreadyPaired) {
                showStatus('This number is already paired! You can use commands directly.', 'success');
                showStep(3);
                return;
            }
            
            currentPairingCode = data.code;
            
            // Show pairing code
            if (pairingCodeDisplay) {
                pairingCodeDisplay.textContent = data.code;
            }
            
            // Move to step 2
            showStep(2);
            showStatus(`Pairing code sent to ${formatPhoneNumber(phone)}`, 'success');
            
            // Start checking status
            startCheckingStatus();
            
        } else {
            showStatus(data.error || 'Failed to generate pairing code', 'error');
            resetGenerateButton();
        }
        
    } catch (error) {
        console.error('Generate pairing error:', error);
        showStatus('Network error. Please check your connection.', 'error');
        resetGenerateButton();
    }
}

// Show specific step
function showStep(stepNumber) {
    // Hide all steps
    for (let i = 1; i <= 3; i++) {
        const stepElement = document.getElementById(`step${i}`);
        if (stepElement) {
            stepElement.classList.add('hidden');
        }
    }
    
    // Show requested step
    const targetStep = document.getElementById(`step${stepNumber}`);
    if (targetStep) {
        targetStep.classList.remove('hidden');
    }
    
    // Reset check button if showing step 2
    if (stepNumber === 2 && checkBtn) {
        checkBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Check Status';
        checkBtn.disabled = false;
    }
}

// Start checking pairing status
function startCheckingStatus() {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    
    checkInterval = setInterval(checkPairingStatus, 3000);
}

// Check pairing status
async function checkPairingStatus() {
    if (!currentPhone || !currentPairingCode) return;
    
    if (checkBtn) {
        checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...';
        checkBtn.disabled = true;
    }
    
    try {
        const response = await fetch('/api/check-pairing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                phone: currentPhone, 
                code: currentPairingCode 
            })
        });
        
        const data = await response.json();
        
        if (data.paired) {
            // Pairing successful
            clearInterval(checkInterval);
            showStep(3);
            showStatus('Device paired successfully! You can now use download commands.', 'success');
            
            // Update stats
            updateStats();
            
        } else if (checkBtn) {
            // Still pending
            checkBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Check Status';
            checkBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('Check status error:', error);
        if (checkBtn) {
            checkBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Check Status';
            checkBtn.disabled = false;
        }
    }
}

// Reset generate button
function resetGenerateButton() {
    if (generateBtn) {
        generateBtn.innerHTML = '<i class="fas fa-qrcode mr-2"></i>Generate Pairing Code';
        generateBtn.disabled = false;
    }
}

// Reset pairing process
function resetPairing() {
    // Clear intervals
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    
    // Reset variables
    currentPairingCode = '';
    currentPhone = '';
    
    // Reset UI
    if (phoneInput) phoneInput.value = '';
    showStep(1);
    resetGenerateButton();
}

// Update statistics
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        if (data) {
            // Update DOM elements
            const elements = {
                'statUsers': data.total_users || 0,
                'statDownloads': data.total_downloads || 0,
                'statYoutube': data.youtube_downloads || 0,
                'statInstagram': data.instagram_downloads || 0,
                'statToday': data.today_downloads || 0
            };
            
            for (const [id, value] of Object.entries(elements)) {
                const element = document.getElementById(id);
                if (element) {
                    // Animate number change
                    animateValue(element, parseInt(element.textContent) || 0, value, 500);
                }
            }
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Animate number change
function animateValue(element, start, end, duration) {
    if (start === end) return;
    
    const range = end - start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;
        
        if (current === end) {
            clearInterval(timer);
        }
    }, stepTime);
}

// Smooth scroll to section
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        window.scrollTo({
            top: element.offsetTop - 80,
            behavior: 'smooth'
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('WhatsApp Downloader Bot loaded');
    
    // Load initial stats
    updateStats();
    
    // Update stats every 30 seconds
    statsInterval = setInterval(updateStats, 30000);
    
    // Setup smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId && targetId !== '#') {
                scrollToSection(targetId.substring(1));
            }
        });
    });
    
    // Setup form submission
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            generatePairingCode();
        });
    }
    
    // Phone input validation
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        
        phoneInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                generatePairingCode();
            }
        });
    }
    
    // Check if QR code is available
    checkQRCode();
});

// Check QR code status
async function checkQRCode() {
    try {
        const response = await fetch('/api/qrcode');
        const data = await response.json();
        
        if (data.success && data.qrcode) {
            // QR code is available
            console.log('QR code generated');
        }
    } catch (error) {
        console.log('QR code not available yet');
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (checkInterval) clearInterval(checkInterval);
    if (statsInterval) clearInterval(statsInterval);
});

// Export functions for global access
window.generatePairingCode = generatePairingCode;
window.checkPairingStatus = checkPairingStatus;
window.resetPairing = resetPairing;
window.scrollToSection = scrollToSection;