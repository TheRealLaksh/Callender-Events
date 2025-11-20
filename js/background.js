// js/background.js

export function initFallingPattern() {
    const canvas = document.getElementById('falling-pattern-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let columns = [];
    const fontSize = 14;
    
    // Configuration
    const color = '#818cf8'; // Tailwind Indigo-400
    const speed = 0.5; // Slower for background elegance

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        
        // Calculate columns based on width
        const columnCount = Math.ceil(width / fontSize);
        
        // Initialize columns with random Y starting positions
        columns = Array(columnCount).fill(0).map(() => Math.random() * -height);
    }

    function draw() {
        // Translucent black background to create "trail" effect
        ctx.fillStyle = 'rgba(2, 6, 23, 0.1)'; // Slate-950 with opacity
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = color;
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < columns.length; i++) {
            // Random character (0 or 1, or abstract chars)
            const text = Math.random() > 0.5 ? '1' : '0'; 
            const x = i * fontSize;
            const y = columns[i];

            // Draw the character
            ctx.fillText(text, x, y);

            // Reset to top randomly or keep falling
            if (y > height && Math.random() > 0.975) {
                columns[i] = 0;
            } else {
                columns[i] += fontSize * speed; // Move down
            }
        }

        requestAnimationFrame(draw);
    }

    // Init
    window.addEventListener('resize', resize);
    resize();
    draw();
}