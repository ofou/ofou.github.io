from fasthtml.common import *

app = FastHTML()


@app.get("/")
def home():
    page = Html(
        Head(
            Title("💾 Omar Olivares' Personal Website"),
            Link(
                rel="stylesheet",
                href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css",
            ),
            Link(rel="preconnect", href="https://fonts.googleapis.com"),
            Link(rel="preconnect", href="https://fonts.gstatic.com", crossorigin=True),
            Link(
                href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&family=Baskervville+SC&family=Baskervville:ital@0;1&family=Bebas+Neue&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Mate+SC&family=Silkscreen:wght@400;700&family=VT323&family=Rubik+Pixels&display=swap",
                rel="stylesheet",
            ),
            Style(
                """
:root {
    --content-width: 720px;
    font-size: 100%;
    
    --body-font: "Archivo", sans-serif;
    
    --title-font: "Fraunces", serif;
    --subtitle-font: "Archivo", sans-serif;
    --link-font: "Silkscreen", monospace;
    --name-font: "Silkscreen", serif;
    --hero-title-font: "Silkscreen", serif;
    --hero-subtitle-font: "Mate SC", serif;
    --quote-font: "Baskervville", serif;
}

body {
    font-family: var(--body-font);
    font-size: 21px;
    font-weight: 500;
    font-style: normal;
    text-align: left;
    padding: 0;
    font-kerning: normal;
    font-variant-ligatures: common-ligatures contextual;
}
  
content p a:link,
content p a:visited,
content p a:active,
content p a:hover,
content li a:link,
content li a:visited,
content li a:active,
content li a:hover {
    text-decoration: none;
    text-decoration-skip-ink: auto
}

content h1,
content h2 {
    max-inline-size: 50ch;
    text-wrap: balance
}

content p,
content li {
    text-wrap: pretty;
}

article {
    margin: auto;
    padding: 2em 3.236em;
}

h1 {
    font-size: 2.2em;
    padding: 0;
    font-family: --var(title-font);
    font-weight: 900;
    font-optical-sizing: auto;
    line-height: 1.1;
}

ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 1em;
}

li {
    font-weight: 400;
    font-size: 1em;
}

a {
    font-family: var(--link-font);
    text-decoration: none;
    transition: color 0.3s ease, text-shadow 0.3s ease;
    font-size: .9em;
    word-spacing: -0.2em;
}

a:hover {
    text-decoration: none;

}

.name {
    font-family: var(--name-font);
    text-align: left;
    font-size: .8em;
    font-weight: 700;
}

h2 {
    font-size: 1.2em;
    padding: 0;
    line-height: 1.2;
    font-family: var(--subtitle-font);
}

blockquote {
    font-family: var(--quote-font);
    padding: 0;
    margin: 2em 0 4em;
}

blockquote p {
    text-indent: -.6em;
}

blockquote footer {
    text-align: right;
    font-family: --var(quote-font);
    font-weight: 400;
    text-transform: uppercase;
    font-size: .8em;
}

blockquote footer cite {
    font-style: normal;
}

blockquote footer a {
    text-decoration: underline;
}

.container {
    max-width: var(--content-width);
    margin: auto;
    text-align: left;
}

.hero {
    text-align: center;
    margin-top: 20%;
    font-size: 2em;
    margin-bottom: 18%;
    
}

.hero-title {
    font-family: var(--hero-title-font);
    margin-bottom: 5%;
    
}

.hero-subtitle {
    font-family: var(--hero-subtitle-font);
    font-size: 54%;
}

.titles {
    font-family: var(--title-font);
    font-variant: small-caps;
}

img,
iframe,
embed,
object,
video {
    width: 100%;
    height: auto;
    vertical-align: middle;
}

summary {}

footer {
    text-align: center;
    font-size: .8em;
    color: #777;
    font-family: var(--body-font);
}

#canvas-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
}

body > *:not(#canvas-container) {
    position: relative;
    z-index: 2;
}

main {

}

.call-to-action {
    display: inline-block;
    padding: 0.8em 2em;
    font-size: .5em;
    background-color: transparent;
    border: 3px solid;
    border-radius: 8px;
    text-decoration: none;
    text-align: center;
    font-family: var(--link-font);
    transition: all 0.3s ease, transform 0.1s ease;
    z-index: 10;
    position: relative;
    box-shadow: 0 5px #0072ad;  /* Shadow to create push depth */
    margin-bottom: -3.5em;
}

.call-to-action:active {
    transform: translateY(5px); /* Moves button down to simulate being pushed */
    box-shadow: 0 2px #005b85;  /* Reduce shadow when pressed */
}

"""
            ),
        ),
        Body(
            Script(
                """

// Create canvas for neural network
const canvas = document.createElement('canvas');
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100%';
canvas.style.height = '100%';
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');
ctx.globalCompositeOperation = 'screen';

// Resize canvas to match window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Create nodes for the neural network
const nodes = [];
const nodeCount = 256;
function createNode() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius: Math.random() * 0.8
    };
}

for (let i = 0; i < nodeCount; i++) {
    nodes.push(createNode());
}

// Color palette for nodes and connections
const colors = [
    { r: 76, g: 214, b: 179, a: 0.2 },  // Teal
    { r: 0, g: 163, b: 255, a: 0.2 },   // Sky Blue
    { r: 255, g: 107, b: 107, a: 0.2 }, // Coral
    { r: 255, g: 206, b: 84, a: 0.2 },  // Yellow
    { r: 170, g: 110, b: 255, a: 0.2 }  // Purple
];

// Function to interpolate between two colors
function interpolateColor(color1, color2, factor) {
    const result = {
        r: Math.round(color1.r + factor * (color2.r - color1.r)),
        g: Math.round(color1.g + factor * (color2.g - color1.g)),
        b: Math.round(color1.b + factor * (color2.b - color1.b)),
        a: color1.a + factor * (color2.a - color1.a)
    };
    return result;
}

// Track mouse position
let mouse = {
    x: null,
    y: null
};

canvas.addEventListener('mousemove', function(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
});

canvas.addEventListener('mouseleave', function() {
    mouse.x = null;
    mouse.y = null;
});

// Update node positions with slight attraction to mouse and deceleration
function updateNodePosition(node) {
    const dampingFactor = 0.999; // Damping factor to reduce velocity over time
    
    if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Apply a weak attraction force if the mouse is close enough
        const maxDistance = 150; // Distance where attraction is applied
        if (distance < maxDistance) {
            const attractionStrength = 0.03; // Control the strength of attraction
            const force = (maxDistance - distance) / maxDistance * attractionStrength;

            node.vx += dx * force;
            node.vy += dy * force;
        }
    }

    // Apply damping to decelerate the velocity over time
    node.vx *= dampingFactor;
    node.vy *= dampingFactor;

    // Update node position
    node.x += node.vx;
    node.y += node.vy;

    // Wrap around edges
    if (node.x < 0) node.x = canvas.width;
    if (node.x > canvas.width) node.x = 0;
    if (node.y < 0) node.y = canvas.height;
    if (node.y > canvas.height) node.y = 0;
}

function drawNeuralNetwork(phase) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw node positions with mouse interaction and deceleration
    nodes.forEach(node => {
        updateNodePosition(node);
    });

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 180) {
                const opacity = (1 - distance / 180) * 0.8;
                const colorIndex = Math.floor(phase * colors.length) % colors.length;
                const nextColorIndex = (colorIndex + 1) % colors.length;
                const factor = (phase * colors.length) % 1;
                const color = interpolateColor(colors[colorIndex], colors[nextColorIndex], factor);
                
                const gradient = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
                gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`);
                gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
                
                ctx.beginPath();
                ctx.moveTo(nodes[i].x, nodes[i].y);
                ctx.lineTo(nodes[j].x, nodes[j].y);
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }
    
    // Draw nodes
    nodes.forEach((node, index) => {
        const colorIndex = (Math.floor(phase * colors.length) + index) % colors.length;
        const nextColorIndex = (colorIndex + 1) % colors.length;
        const factor = (phase * colors.length) % 1;
        const color = interpolateColor(colors[colorIndex], colors[nextColorIndex], factor);
        
        // Adjust the glow size here
        const glow = 3 + 0.2 * Math.sin(phase * Math.PI * 2 + index);
        
        ctx.beginPath();
        
        // Adjust the node size here
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 20);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + glow, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + glow);
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
    });
}

let lastTime = 0;
const animationDuration = 15000; // 15 seconds per cycle

function animate(timestamp) {
    const elapsed = timestamp - lastTime;
    lastTime = timestamp;

    const phase = (timestamp % animationDuration) / animationDuration;
    drawNeuralNetwork(phase);

    requestAnimationFrame(animate);
}

// Ensure the body takes up the full viewport and allows scrolling
document.body.style.margin = '0';
document.body.style.minHeight = '100vh';
document.body.style.overflow = 'auto';
document.body.style.position = 'relative';

// Start the animation
requestAnimationFrame(animate);


"""
            ),
            Main(
                Nav(
                    Ul(Li("Omar Olivares")),
                    Ul(
                        Li(A("Articles", href="#articles")),
                        Li(A("Projects", href="#projects")),
                        Li(A("About Me", href="#about")),
                    ),
                    cls="name",
                ),
                Section(
                    H1("I'm sorry, Dave.", cls="hero-title"),
                    P(
                        Strong("I can do that. "),
                        "I work with clients to create innovative AI solutions that enhance their operations and unlock new opportunities.",
                        Hr(),
                        cls="hero-subtitle",
                    ),
                    A(
                        "Let's talk",
                        href="https://calendar.app.google/kcbfemxAYBoNPXbS8",
                        cls="call-to-action",
                    ),
                    cls="hero",
                ),
                Section(
                    P(
                        "As an AI Engineer originally from Santiago, Chile, I specialize in building custom AI solutions tailored to your business needs. "
                        "With experience leading AI development at Emergent Mind, I have expertise in developing deep learning models, designing RAG pipelines, and collaborating on product strategy. "
                        "Take a look at my work at ",
                        A("Emergent Mind", href="https://www.emergentmind.com"),
                        ".",
                    ),
                    P(
                        "I also create content to make complex technologies accessible. As the creator of ",
                        A(
                            "Neura Pod",
                            href="https://www.youtube.com/channel/UCNeuraPod",
                        ),
                        ", I have grown the channel to over 80,000 subscribers. "
                        "My mission is to bridge the gap between advanced AI technologies and practical business applications.",
                    ),
                    Footer(
                        P(
                            "Get in touch via ",
                            A("X", href="https://twitter.com/omarnomad"),
                            ", ",
                            A("Linkedin", href="https://www.linkedin.com/in/ofou"),
                            " or ",
                            A("omar@olivares.cl", href="mailto:omar@olivares.cl"),
                            ".",
                        )
                    ),
                    cls="about-me container",
                ),
                cls="container",
            ),
            Footer(
                Small("© 2024 Omar Olivares"),
            ),
        ),
    )
    return page


serve()
