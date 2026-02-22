/**
 * ============================================
 * SCC SATELITAL-YAMATO
 * API Extendida v3.0 - Soporte WebWorkers, Canvas, UI Panels
 * ============================================
 */

class SCCExtendedAPI extends SCCCoreAPI {
    constructor() {
        super();
        this.version = '3.0.0-extended';
        this.apiLevel = 5;
        this.panels = new Map();
        this.workers = new Map();
        this.canvases = new Map();
        this.uiOverlays = new Map();
        this.cssInjected = new Set();
        
        // Sandbox mejorado para plugins
        this.pluginSandbox = null;
        this.initAdvancedSandbox();
    }

    initAdvancedSandbox() {
        // Crear namespace seguro para plugins
        this.pluginSandbox = {
            console: {
                log: (...args) => this.triggerHook('console.log', args.join(' ')),
                error: (...args) => this.triggerHook('console.error', args.join(' ')),
                warn: (...args) => this.triggerHook('console.warn', args.join(' '))
            },
            
            // API de Matemáticas
            Math: Math,
            
            // API de Tiempo
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            setInterval: (fn, ms) => setInterval(fn, ms),
            clearTimeout: (id) => clearTimeout(id),
            clearInterval: (id) => clearInterval(id),
            Date: Date,
            
            // API de Arrays y Objetos
            Array: Array,
            Object: Object,
            JSON: JSON,
            
            // Aleatorios seguros
            random: () => Math.random(),
            
            // Peticiones controladas
            fetch: (url, opts) => this.sandboxedFetch(url, opts)
        };
    }

    async sandboxedFetch(url, options = {}) {
        // Solo permitir URLs de la misma origin o APIs específicas
        const allowedDomains = [
            'api.open-meteo.com',
            'celestrak.org',
            'db.satnogs.org'
        ];
        
        try {
            const urlObj = new URL(url);
            if (!allowedDomains.includes(urlObj.hostname) && urlObj.hostname !== window.location.hostname) {
                throw new Error(`Dominio no permitido: ${urlObj.hostname}`);
            }
            
            const response = await fetch(url, {
                ...options,
                credentials: 'omit' // No enviar cookies
            });
            
            return {
                ok: response.ok,
                status: response.status,
                text: () => response.text(),
                json: () => response.json()
            };
        } catch (e) {
            throw new Error(`Fetch bloqueado: ${e.message}`);
        }
    }

    // ============================================================
    // WEBWORKERS PARA PLUGINS
    // ============================================================
    
    createWorker(pluginId, workerCode, options = {}) {
        try {
            // Crear blob con el código del worker
            const workerBlob = new Blob([`
                // Librerías matemáticas disponibles en el worker
                const FFT = {
                    transform: function(real, imag) {
                        const n = real.length;
                        if (n <= 1) return;
                        
                        const half = n / 2;
                        const evenReal = new Array(half);
                        const evenImag = new Array(half);
                        const oddReal = new Array(half);
                        const oddImag = new Array(half);
                        
                        for (let i = 0; i < half; i++) {
                            evenReal[i] = real[i * 2];
                            evenImag[i] = imag[i * 2];
                            oddReal[i] = real[i * 2 + 1];
                            oddImag[i] = imag[i * 2 + 1];
                        }
                        
                        this.transform(evenReal, evenImag);
                        this.transform(oddReal, oddImag);
                        
                        for (let k = 0; k < half; k++) {
                            const angle = -2 * Math.PI * k / n;
                            const cos = Math.cos(angle);
                            const sin = Math.sin(angle);
                            
                            const oddR = oddReal[k] * cos - oddImag[k] * sin;
                            const oddI = oddReal[k] * sin + oddImag[k] * cos;
                            
                            real[k] = evenReal[k] + oddR;
                            imag[k] = evenImag[i] + oddI;
                            real[k + half] = evenReal[k] - oddR;
                            imag[k + half] = evenImag[k] - oddI;
                        }
                    },
                    
                    magnitude: function(real, imag) {
                        return real.map((r, i) => Math.sqrt(r*r + imag[i]*imag[i]));
                    }
                };
                
                // Algoritmos de DSP
                const DSP = {
                    // Filtro paso bajo
                    lowpass: function(data, cutoff, sampleRate) {
                        const rc = 1.0 / (2 * Math.PI * cutoff);
                        const dt = 1.0 / sampleRate;
                        const alpha = dt / (rc + dt);
                        
                        const filtered = new Array(data.length);
                        filtered[0] = data[0];
                        
                        for (let i = 1; i < data.length; i++) {
                            filtered[i] = filtered[i-1] + alpha * (data[i] - filtered[i-1]);
                        }
                        
                        return filtered;
                    },
                    
                    // Ventana de Blackman-Harris
                    blackmanHarris: function(N) {
                        const window = new Array(N);
                        const a0 = 0.35875, a1 = 0.48829, a2 = 0.14128, a3 = 0.01168;
                        
                        for (let i = 0; i < N; i++) {
                            window[i] = a0 
                                - a1 * Math.cos(2 * Math.PI * i / (N - 1))
                                + a2 * Math.cos(4 * Math.PI * i / (N - 1))
                                - a3 * Math.cos(6 * Math.PI * i / (N - 1));
                        }
                        
                        return window;
                    },
                    
                    // Calcular cumulantes para clasificación de modulación
                    cumulants: function(iq) {
                        const n = iq.length;
                        let C20 = 0, C21 = 0, C40 = 0, C41 = 0, C42 = 0;
                        
                        for (let i = 0; i < n; i++) {
                            const s = iq[i];
                            const s2 = s * s;
                            const s3 = s2 * s;
                            const s4 = s2 * s2;
                            
                            C20 += s2;
                            C21 += Math.abs(s2);
                            C40 += s4;
                            C41 += s3 * Math.conj ? Math.conj(s) : s;
                            C42 += s2 * s2;
                        }
                        
                        return {
                            C20: C20 / n,
                            C21: C21 / n,
                            C40: C40 / n - 3 * Math.pow(C21 / n, 2),
                            C41: C41 / n,
                            C42: C42 / n - Math.pow(Math.abs(C20 / n), 2) - 2 * Math.pow(C21 / n, 2)
                        };
                    }
                };
                
                // Clasificador de modulación
                const ModulationClassifier = {
                    classify: function(cumulants, snr) {
                        const {C20, C40, C42} = cumulants;
                        
                        // Árbol de decisión basado en cumulantes teóricos
                        if (Math.abs(C20) > 0.9) {
                            return { type: 'BPSK', confidence: 0.95, C40: C40 };
                        }
                        
                        if (Math.abs(C40) < 0.5 && Math.abs(C42) < 0.5) {
                            return { type: 'QPSK', confidence: 0.92, C40: C40 };
                        }
                        
                        if (C40 < -0.5) {
                            return { type: '8PSK', confidence: 0.88, C40: C40 };
                        }
                        
                        if (C40 > 0.5 && Math.abs(C42) > 0.5) {
                            return { type: '16QAM', confidence: 0.85, C40: C40 };
                        }
                        
                        if (C40 > 1.0) {
                            return { type: '64QAM', confidence: 0.82, C40: C40 };
                        }
                        
                        return { type: 'UNKNOWN', confidence: 0.0, C40: C40 };
                    }
                };
                
                // Manejador de mensajes
                self.onmessage = function(e) {
                    const { type, data, id } = e.data;
                    let result;
                    
                    try {
                        switch(type) {
                            case 'fft':
                                const real = data.real || data;
                                const imag = new Array(real.length).fill(0);
                                FFT.transform(real, imag);
                                result = {
                                    magnitude: FFT.magnitude(real, imag),
                                    real: real,
                                    imag: imag
                                };
                                break;
                                
                            case 'filter':
                                result = DSP.lowpass(data.signal, data.cutoff, data.sampleRate);
                                break;
                                
                            case 'classify_modulation':
                                const cumulants = DSP.cumulants(data.iq_samples);
                                result = ModulationClassifier.classify(cumulants, data.snr);
                                break;
                                
                            case 'window':
                                result = DSP.blackmanHarris(data.size);
                                break;
                                
                            case 'evm':
                                // Calcular EVM
                                let errorSum = 0, powerSum = 0;
                                for (let i = 0; i < data.ideal.length; i++) {
                                    const err = data.ideal[i] - data.measured[i];
                                    errorSum += err * err;
                                    powerSum += data.ideal[i] * data.ideal[i];
                                }
                                result = { evm: Math.sqrt(errorSum / powerSum) * 100 };
                                break;
                                
                            case 'custom':
                                // Ejecutar código personalizado del plugin
                                const customFunc = new Function('data', 'FFT', 'DSP', data.code);
                                result = customFunc(data.input, FFT, DSP);
                                break;
                                
                            default:
                                throw new Error('Tipo de operación desconocido: ' + type);
                        }
                        
                        self.postMessage({ id, success: true, result });
                    } catch (err) {
                        self.postMessage({ id, success: false, error: err.message });
                    }
                };
            `], { type: 'application/javascript' });

            const workerUrl = URL.createObjectURL(workerBlob);
            const worker = new Worker(workerUrl);
            
            // Wrapper para comunicación Promise-based
            const workerWrapper = {
                id: pluginId + '_' + Date.now(),
                worker: worker,
                pending: new Map(),
                messageId: 0,
                
                send: function(type, data, timeout = 5000) {
                    return new Promise((resolve, reject) => {
                        const id = this.messageId++;
                        const timer = setTimeout(() => {
                            this.pending.delete(id);
                            reject(new Error('Worker timeout'));
                        }, timeout);
                        
                        this.pending.set(id, { resolve, reject, timer });
                        this.worker.postMessage({ type, data, id });
                    });
                },
                
                terminate: function() {
                    this.worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    this.pending.forEach(p => {
                        clearTimeout(p.timer);
                        p.reject(new Error('Worker terminado'));
                    });
                    this.pending.clear();
                }
            };
            
            // Manejar respuestas
            worker.onmessage = (e) => {
                const { id, success, result, error } = e.data;
                const pending = workerWrapper.pending.get(id);
                if (pending) {
                    clearTimeout(pending.timer);
                    workerWrapper.pending.delete(id);
                    success ? pending.resolve(result) : pending.reject(new Error(error));
                }
            };
            
            worker.onerror = (err) => {
                console.error(`[Worker ${pluginId}] Error:`, err);
            };
            
            this.workers.set(workerWrapper.id, workerWrapper);
            return workerWrapper;
            
        } catch (e) {
            console.error('Error creando worker:', e);
            return null;
        }
    }

    terminateWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.terminate();
            this.workers.delete(workerId);
        }
    }

    // ============================================================
    // CREACIÓN DE PANELES UI
    // ============================================================
    
    createPanel(pluginId, config) {
        const {
            id,
            title,
            position = 'right', // 'right', 'left', 'bottom', 'floating', 'modal'
            size = { width: 350, height: 400 },
            closable = true,
            resizable = true,
            draggable = position === 'floating'
        } = config;

        const panelId = `${pluginId}_${id}`;
        
        // Verificar si ya existe
        if (this.panels.has(panelId)) {
            console.warn(`Panel ${panelId} ya existe`);
            return this.panels.get(panelId);
        }

        // Crear elemento del panel
        const panel = document.createElement('div');
        panel.id = panelId;
        panel.className = `scc-panel scc-panel-${position}`;
        panel.style.cssText = `
            position: ${position === 'floating' || position === 'modal' ? 'fixed' : 'relative'};
            width: ${size.width}px;
            height: ${size.height}px;
            background: rgba(21, 25, 33, 0.95);
            border: 1px solid var(--accent-cyan, #00d4ff);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            z-index: 1000;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            ${position === 'right' ? 'margin-left: auto;' : ''}
            ${position === 'floating' ? `top: 100px; left: 100px;` : ''}
            ${position === 'modal' ? `top: 50%; left: 50%; transform: translate(-50%, -50%);` : ''}
        `;

        // Header del panel
        const header = document.createElement('div');
        header.className = 'scc-panel-header';
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: linear-gradient(90deg, rgba(0,212,255,0.1), transparent);
            border-bottom: 1px solid rgba(0,212,255,0.2);
            cursor: ${draggable ? 'grab' : 'default'};
            user-select: none;
        `;
        
        header.innerHTML = `
            <span style="color: var(--accent-cyan, #00d4ff); font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600;">
                ${title}
            </span>
            ${closable ? `
                <button class="scc-panel-close" style="
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.2);
                    color: var(--text-muted, #64748b);
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">×</button>
            ` : ''}
        `;

        // Content area
        const content = document.createElement('div');
        content.className = 'scc-panel-content';
        content.style.cssText = `
            flex: 1;
            overflow: auto;
            padding: 15px;
            position: relative;
        `;

        panel.appendChild(header);
        panel.appendChild(content);

        // Insertar en el DOM según posición
        if (position === 'right' || position === 'left') {
            const sidebar = document.querySelector('.dashboard-grid');
            if (sidebar) {
                const targetCol = position === 'right' ? 3 : 1;
                const col = sidebar.children[targetCol - 1];
                if (col) col.appendChild(panel);
            } else {
                document.body.appendChild(panel);
            }
        } else if (position === 'bottom') {
            const bottomArea = document.querySelector('.bottom-telemetry');
            if (bottomArea) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'grid-column: 1 / -1;';
                wrapper.appendChild(panel);
                bottomArea.appendChild(wrapper);
            }
        } else {
            document.body.appendChild(panel);
        }

        // Event listeners
        if (closable) {
            panel.querySelector('.scc-panel-close').addEventListener('click', () => {
                this.destroyPanel(panelId);
            });
        }

        if (draggable) {
            this.makeDraggable(panel, header);
        }

        if (resizable) {
            this.makeResizable(panel);
        }

        // Guardar referencia
        const panelObj = {
            id: panelId,
            element: panel,
            content: content,
            config: config,
            pluginId: pluginId,
            
            // Métodos útiles
            setHTML: (html) => { content.innerHTML = html; },
            appendHTML: (html) => { content.innerHTML += html; },
            clear: () => { content.innerHTML = ''; },
            createCanvas: (width, height) => this.createCanvasInPanel(panelObj, width, height),
            destroy: () => this.destroyPanel(panelId)
        };

        this.panels.set(panelId, panelObj);
        return panelObj;
    }

    destroyPanel(panelId) {
        const panel = this.panels.get(panelId);
        if (panel) {
            panel.element.remove();
            this.panels.delete(panelId);
        }
    }

    makeDraggable(element, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            handle.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${initialLeft + dx}px`;
            element.style.top = `${initialTop + dy}px`;
            element.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            handle.style.cursor = 'grab';
        });
    }

    makeResizable(element) {
        const resizer = document.createElement('div');
        resizer.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 0;
            width: 15px;
            height: 15px;
            cursor: se-resize;
            background: linear-gradient(135deg, transparent 50%, var(--accent-cyan, #00d4ff) 50%);
            border-radius: 0 0 0 8px;
        `;
        element.appendChild(resizer);

        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            element.style.width = `${startWidth + e.clientX - startX}px`;
            element.style.height = `${startHeight + e.clientY - startY}px`;
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }

    // ============================================================
    // CANVAS NATIVO PARA PLUGINS
    // ============================================================
    
    createCanvasInPanel(panel, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.cssText = `
            background: #0a0c10;
            border: 1px solid var(--border-color, #2d3748);
            border-radius: 4px;
            display: block;
            max-width: 100%;
        `;
        
        panel.content.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const canvasObj = {
            element: canvas,
            ctx: ctx,
            width: width,
            height: height,
            
            // Helpers de dibujo estilo SCC
            clear: () => {
                ctx.fillStyle = '#0a0c10';
                ctx.fillRect(0, 0, width, height);
            },
            
            drawGrid: (divisions = 10, color = 'rgba(0,212,255,0.1)') => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                
                for (let i = 0; i <= divisions; i++) {
                    const x = (width / divisions) * i;
                    const y = (height / divisions) * i;
                    
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
            },
            
            plotLine: (data, color = '#00d4ff', lineWidth = 2) => {
                if (data.length < 2) return;
                
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                
                const stepX = width / (data.length - 1);
                const minVal = Math.min(...data);
                const maxVal = Math.max(...data);
                const range = maxVal - minVal || 1;
                
                data.forEach((val, i) => {
                    const x = i * stepX;
                    const y = height - ((val - minVal) / range) * height;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                
                ctx.stroke();
            },
            
            plotPoints: (points, color = '#ff6b35', radius = 3) => {
                ctx.fillStyle = color;
                points.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        };
        
        // Guardar referencia
        const canvasId = `${panel.id}_canvas_${Date.now()}`;
        this.canvases.set(canvasId, canvasObj);
        
        return canvasObj;
    }

    // ============================================================
    // INYECCIÓN DE CSS PARA PLUGINS
    // ============================================================
    
    injectCSS(pluginId, css) {
        if (this.cssInjected.has(pluginId)) return;
        
        const style = document.createElement('style');
        style.id = `scc-plugin-css-${pluginId}`;
        style.textContent = css;
        document.head.appendChild(style);
        this.cssInjected.add(pluginId);
    }

    removeCSS(pluginId) {
        const style = document.getElementById(`scc-plugin-css-${pluginId}`);
        if (style) {
            style.remove();
            this.cssInjected.delete(pluginId);
        }
    }

    // ============================================================
    // ACCESO A DATOS DEL ESPECTRO
    // ============================================================
    
    getSpectrumData() {
        if (window.spectrum) {
            return {
                current: window.spectrum.data.current,
                maxHold: window.spectrum.data.maxHold,
                average: window.spectrum.data.average,
                peaks: window.spectrum.data.peaks,
                config: window.spectrum.config,
                state: window.spectrum.state
            };
        }
        return null;
    }

    subscribeSpectrum(callback, interval = 100) {
        if (!window.spectrum) return null;
        
        const handler = setInterval(() => {
            const data = this.getSpectrumData();
            if (data) callback(data);
        }, interval);
        
        return () => clearInterval(handler);
    }

    // ============================================================
    // NOTIFICACIONES Y OVERLAYS
    // ============================================================
    
    showNotification(pluginId, options) {
        const {
            type = 'info', // 'info', 'success', 'warning', 'error'
            message,
            duration = 3000,
            position = 'top-right'
        } = options;

        const notif = document.createElement('div');
        const colors = {
            info: '#00d4ff',
            success: '#00d9a3',
            warning: '#ffc107',
            error: '#ff4757'
        };
        
        notif.style.cssText = `
            position: fixed;
            ${position.includes('top') ? 'top: 70px;' : 'bottom: 100px;'}
            ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
            background: rgba(21, 25, 33, 0.95);
            border-left: 4px solid ${colors[type]};
            color: #e8ecf1;
            padding: 15px 20px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            z-index: 10000;
            box-shadow: 0 5px 20px rgba(0,0,0,0.5);
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        `;
        
        notif.innerHTML = `
            <div style="font-weight: 600; color: ${colors[type]}; margin-bottom: 5px;">
                ${type.toUpperCase()}
            </div>
            <div>${message}</div>
        `;
        
        document.body.appendChild(notif);
        
        if (duration > 0) {
            setTimeout(() => {
                notif.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => notif.remove(), 300);
            }, duration);
        }
        
        return notif;
    }

    // ============================================================
    // CARGA DE PLUGINS V3 (BACKWARDS COMPATIBLE)
    // ============================================================
    
    async loadPluginV3(pluginData) {
        try {
            const pkg = typeof pluginData === 'string' ? JSON.parse(pluginData) : pluginData;
            
            // Validar manifest
            if (!pkg.manifest || !pkg.code) {
                throw new Error('Formato de plugin inválido');
            }
            
            // Crear contexto de ejecución extendido
            const pluginContext = {
                id: pkg.manifest.id,
                manifest: pkg.manifest,
                worker: null,
                panels: new Set(),
                intervals: [],
                hooks: []
            };
            
            // Función de limpieza
            const cleanup = () => {
                if (pluginContext.worker) {
                    this.terminateWorker(pluginContext.worker.id);
                }
                pluginContext.panels.forEach(p => this.destroyPanel(p));
                pluginContext.intervals.forEach(i => clearInterval(i));
                pluginContext.hooks.forEach(h => this.unregisterHook(h.event, h.index));
            };
            
            // API expuesta al plugin (versión extendida)
            const PluginAPI = {
                // API base
                ...this.getPublicAPI(),
                
                // API extendida
                createWorker: (code) => {
                    const worker = this.createWorker(pkg.manifest.id, code);
                    if (worker) pluginContext.worker = worker;
                    return worker;
                },
                
                createPanel: (config) => {
                    const panel = this.createPanel(pkg.manifest.id, config);
                    if (panel) pluginContext.panels.add(panel.id);
                    return panel;
                },
                
                injectCSS: (css) => this.injectCSS(pkg.manifest.id, css),
                
                getSpectrumData: () => this.getSpectrumData(),
                subscribeSpectrum: (cb, interval) => {
                    const unsub = this.subscribeSpectrum(cb, interval);
                    return unsub;
                },
                
                showNotification: (opts) => this.showNotification(pkg.manifest.id, opts),
                
                createCanvas: (width, height, container) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.style.cssText = 'background: #0a0c10; border: 1px solid #2d3748;';
                    if (container) container.appendChild(canvas);
                    return {
                        element: canvas,
                        ctx: canvas.getContext('2d'),
                        width, height
                    };
                },
                
                setInterval: (fn, ms) => {
                    const id = setInterval(fn, ms);
                    pluginContext.intervals.push(id);
                    return id;
                },
                
                registerHook: (event, callback, priority = 10) => {
                    const idx = super.registerHook(event, callback, priority);
                    pluginContext.hooks.push({ event, index: idx });
                    return idx;
                },
                
                // Utilidades DSP
                DSP: {
                    // FFT simple (usa worker si disponible)
                    fft: async (signal) => {
                        if (pluginContext.worker) {
                            return await pluginContext.worker.send('fft', { real: signal });
                        }
                        // Fallback a implementación simple
                        return this.simpleFFT(signal);
                    },
                    
                    // Clasificar modulación
                    classifyModulation: async (iqSamples, snr = 20) => {
                        if (pluginContext.worker) {
                            return await pluginContext.worker.send('classify_modulation', {
                                iq_samples: iqSamples,
                                snr: snr
                            });
                        }
                        return { type: 'UNKNOWN', confidence: 0 };
                    },
                    
                    // Calcular EVM
                    calculateEVM: async (ideal, measured) => {
                        if (pluginContext.worker) {
                            return await pluginContext.worker.send('evm', { ideal, measured });
                        }
                        // Cálculo simple
                        let errorSum = 0, powerSum = 0;
                        for (let i = 0; i < ideal.length; i++) {
                            const err = ideal[i] - measured[i];
                            errorSum += err * err;
                            powerSum += ideal[i] * ideal[i];
                        }
                        return { evm: Math.sqrt(errorSum / powerSum) * 100 };
                    }
                },
                
                // Cleanup al desactivar
                onDestroy: cleanup
            };
            
            // Ejecutar código del plugin en sandbox
            const initFunc = new Function('API', `
                "use strict";
                ${pkg.code}
                return typeof init !== 'undefined' ? init : (() => {});
            `);
            
            const userInit = initFunc(PluginAPI);
            const pluginInstance = await userInit(PluginAPI);
            
            // Registrar plugin
            const pluginObj = {
                manifest: pkg.manifest,
                context: pluginContext,
                instance: pluginInstance,
                exports: pluginInstance || {},
                active: true,
                cleanup: cleanup
            };
            
            this.pluginRegistry.set(pkg.manifest.id, pluginObj);
            this.triggerHook('plugin.loaded', { id: pkg.manifest.id, manifest: pkg.manifest });
            
            return { success: true, id: pkg.manifest.id, name: pkg.manifest.name };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // FFT simple como fallback
    simpleFFT(signal) {
        const N = signal.length;
        if (N <= 1) return signal;
        
        const even = [], odd = [];
        for (let i = 0; i < N; i++) {
            if (i % 2 === 0) even.push(signal[i]);
            else odd.push(signal[i]);
        }
        
        const evenFFT = this.simpleFFT(even);
        const oddFFT = this.simpleFFT(odd);
        const result = new Array(N);
        
        for (let k = 0; k < N / 2; k++) {
            const angle = -2 * Math.PI * k / N;
            const t = {
                re: oddFFT[k] * Math.cos(angle),
                im: oddFFT[k] * Math.sin(angle)
            };
            result[k] = evenFFT[k] + t.re;
            result[k + N/2] = evenFFT[k] - t.re;
        }
        
        return result;
    }

    // Sobrescribir unload para limpieza extendida
    unloadPlugin(id) {
        const plugin = this.pluginRegistry.get(id);
        if (plugin) {
            if (plugin.cleanup) plugin.cleanup();
            this.removeCSS(id);
            super.unloadPlugin(id);
        }
    }

    // API pública base (compatible con v2)
    getPublicAPI() {
        return {
            version: this.version,
            registerCommand: (name, desc, handler, args) => 
                this.registerCommand(name, desc, handler, args),
            triggerHook: (event, data) => this.triggerHook(event, data),
            generateUUID: () => this.generateUUID(),
            evalSandbox: (code) => this.evalSandbox(code)
        };
    }

    // ============================================================
    // FIX v3.1: Comandos de plugin extendidos
    // ============================================================

    cmdPlugin(args) {
        const action = args.action || args._[0];
        const id = args.id || args._[1];
        
        switch(action) {
            case 'list':
                if (this.pluginRegistry.size === 0) {
                    return '\n?? No hay plugins instalados\nUsa el Plugin Manager para cargar plugins.';
                }
                
                let list = '\n+- PLUGINS INSTALADOS -------------------------+\n';
                this.pluginRegistry.forEach((plugin, pid) => {
                    const status = plugin.active ? '??' : '??';
                    const builtin = plugin.manifest.author === 'system' ? '[SYS]' : '[EXT]';
                    list += `¦ ${status} ${builtin} ${pid.padEnd(35)} ¦\n`;
                    list += `¦    ${plugin.manifest.name.substring(0, 40).padEnd(40)} ¦\n`;
                    list += `¦    v${plugin.manifest.version} por ${plugin.manifest.author.substring(0, 25).padEnd(25)} ¦\n`;
                    list += `+----------------------------------------------¦\n`;
                });
                list += `+----------------------------------------------+\n`;
                list += `\nTotal: ${this.pluginRegistry.size} plugin(s)`;
                return list;
                
            case 'load':
                return '?? Usa el Plugin Manager visual (botón ??) o arrastra un archivo .sccplugin';
                
            case 'unload':
                if (!id) return '? Uso: plugin unload <id>';
                if (this.pluginRegistry.has(id)) {
                    this.unloadPlugin(id);
                    return `? Plugin ${id} descargado`;
                }
                return `? Plugin no encontrado: ${id}`;
                
            case 'info':
                if (!id) return '? Uso: plugin info <id>';
                const p = this.pluginRegistry.get(id);
                if (!p) return `? Plugin no encontrado: ${id}`;
                return `
+-- INFO DEL PLUGIN ---------------------------+
¦ ID: ${id.padEnd(43)}¦
¦ Nombre: ${p.manifest.name.padEnd(40)}¦
¦ Versión: ${p.manifest.version.padEnd(41)}¦
¦ Autor: ${p.manifest.author.padEnd(43)}¦
¦ Estado: ${(p.active ? 'Activo ??' : 'Inactivo ??').padEnd(42)}¦
¦ API Level: ${(p.manifest.apiVersion || '2.x').padEnd(39)}¦
+----------------------------------------------+
                `.trim();
                
            default:
                return 'Uso: plugin [list|load|unload|info] [id]';
        }
    }
}

// CSS necesario para paneles
const SCC_PANEL_CSS = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

.scc-panel {
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}
`;

// Inicializar API extendida cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Inyectar CSS
    const style = document.createElement('style');
    style.textContent = SCC_PANEL_CSS;
    document.head.appendChild(style);
    
    // Reemplazar API global si existe
    if (window.$SCC) {
        const extended = new SCCExtendedAPI();
        // Copiar registros existentes
        extended.commandRegistry = window.$SCC.commandRegistry;
        extended.hooks = window.$SCC.hooks;
        
        // Actualizar comandos del sistema
        extended.commandRegistry.set('plugin', {
            description: 'Gestión de plugins (v3)',
            handler: (args) => extended.cmdPlugin(args),
            args: ['action', 'id'],
            builtin: true,
            author: 'system'
        });
        
        // Comando debug para diagnóstico
        extended.commandRegistry.set('debug', {
            description: 'Diagnóstico del sistema',
            handler: () => {
                const plugins = Array.from(extended.pluginRegistry.keys());
                const commands = Array.from(extended.commandRegistry.keys());
                return `
+-- DIAGNÓSTICO SCC ---------------------------+
¦ API Version: ${extended.version.padEnd(41)}¦
¦ API Level: ${String(extended.apiLevel).padEnd(43)}¦
¦ Plugins cargados: ${String(plugins.length).padEnd(37)}¦
¦ Comandos disponibles: ${String(commands.length).padEnd(33)}¦
¦----------------------------------------------¦
¦ PLUGINS: ${plugins.join(', ').substring(0, 40).padEnd(42)}¦
¦----------------------------------------------¦
¦ COMANDOS: ${commands.slice(-8).join(', ').substring(0, 39).padEnd(41)}¦
+----------------------------------------------+
                `.trim();
            },
            args: [],
            builtin: true,
            author: 'system'
        });
        
        window.$SCC = extended;
        console.log('[SCC API v3.0] API Extendida cargada con fixes');
    } else {
        window.$SCC = new SCCExtendedAPI();
    }
});