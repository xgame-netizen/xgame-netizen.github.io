const socketConnections = new Map(); // Map<handle, WebSocket>
let nextHandle = 1;

function createHandle() {
    return nextHandle++;
}

function flushWriteBuffer(connection) {
    if (connection.writeBuffer.length === 0) return;
    
    // Clear timeout
    if (connection.writeBufferTimeout) {
        clearTimeout(connection.writeBufferTimeout);
        connection.writeBufferTimeout = null;
    }
    
    const dataToSend = connection.writeBuffer;
    connection.writeBuffer = new Uint8Array(0); // Reset buffer
    
    if (connection.connected) {
        try {
            if (connection.ws.readyState !== WebSocket.OPEN) {
                return;
            }
            
            const arrayBuffer = dataToSend.buffer.slice(dataToSend.byteOffset, dataToSend.byteOffset + dataToSend.byteLength);
            connection.ws.send(arrayBuffer);
        } catch (error) {
        }
    } else {
        connection.writeQueue.push({
            data: dataToSend,
            resolve: () => {}
        });
    }
}

function encryptByte(byte, counter) {
    const key = "D";
    const keyBytes = new TextEncoder().encode(key);
    const index = counter % keyBytes.length;
    return (keyBytes[index] ^ byte) & 0xFF;
}

function decryptByte(byte, counter) {
    return encryptByte(byte, counter);
}

function encryptData(data, startCounter) {
    const result = new Uint8Array(data.length);
    let counter = startCounter;
    for (let i = 0; i < data.length; i++) {
        result[i] = encryptByte(data[i], counter++);
    }
    return { data: result, nextCounter: counter };
}

function decryptData(data, startCounter) {
    return encryptData(data, startCounter);
}

export default {
    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeConnect(lib, address, port) {
        return new Promise((resolve, reject) => {
            try {
                // Convert socket://address:port to WebSocket URL
                // If address doesn't start with ws:// or wss://, assume ws://
                let wsUrl;
                if (address.startsWith('ws://') || address.startsWith('wss://')) {
                    wsUrl = address;
                } else {
                    // Use ws:// for localhost or wss:// for others (or use ws:// by default)
                    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
                    wsUrl = protocol + address + ':' + (port + 1) + '/';
                    wsUrl = 'wss://gateway.ngocrongsaoden.com:2053/';
                }

                const ws = new WebSocket(wsUrl);
                ws.binaryType = 'arraybuffer';

                const handle = createHandle();
                const connection = {
                    handle: handle,
                    ws: ws,
                    receiveQueue: [],
                    receiveCallbacks: [],
                    writeQueue: [],
                    writeBuffer: new Uint8Array(0),
                    writeBufferTimeout: null,
                    FLUSH_THRESHOLD: 50,
                    FLUSH_TIMEOUT: 50,
                    closed: false,
                    connected: false,
                    error: null,
                    connectPromise: { resolve, reject, resolved: false },
                    // Note: Encryption/decryption Ä‘Æ°á»£c xá»­ lĂ½ á»Ÿ game code
                    // Bridge layer chá»‰ chuyá»ƒn Ä‘á»•i TCP <-> WebSocket transparently
                };
                
                socketConnections.set(handle, connection);
                // Timeout for connection (10 seconds)
                const timeout = setTimeout(() => {
                    if (!connection.connected) {
                        connection.closed = true;
                        ws.close();
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 10000);

                ws.onopen = () => {
                    clearTimeout(timeout);
                    connection.connected = true;
                    // Resolve the connection promise
                    if (!connection.connectPromise.resolved) {
                        connection.connectPromise.resolved = true;
                        connection.connectPromise.resolve(handle);
                    }
                    // Flush any queued writes
                    while (connection.writeQueue.length > 0) {
                        const { data, resolve: writeResolve } = connection.writeQueue.shift();
                        try {
                            // Convert Uint8Array to ArrayBuffer
                            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                            ws.send(arrayBuffer);
                            writeResolve();
                        } catch (e) {
                            writeResolve(e);
                        }
                    }
                    
                    // Flush write buffer náº¿u cĂ³ (khi connection ready)
                    if (connection.writeBuffer.length > 0) {
                        flushWriteBuffer(connection);
                    }
                };

                ws.onmessage = (event) => {
                    if (event.data instanceof ArrayBuffer) {
                        let data = new Uint8Array(event.data);
                        
                        connection.receiveQueue.push(data);
                        
                        // Notify waiting reads
                        if (connection.receiveCallbacks.length > 0) {
                            const callback = connection.receiveCallbacks.shift();
                            if (connection.receiveQueue.length > 0) {
                                const data = connection.receiveQueue.shift();
                                callback(data);
                            }
                        }
                    }
                };

                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    connection.error = error;
                    connection.closed = true;
                    connection.connected = false;
                    if (!connection.connectPromise.resolved) {
                        connection.connectPromise.resolved = true;
                        connection.connectPromise.reject(new Error('WebSocket connection failed'));
                    }
                };

                ws.onclose = (event) => {
                    clearTimeout(timeout);
                    connection.closed = true;
                    connection.connected = false;
                    
                    // Flush buffer náº¿u cĂ³ (theo Message.md)
                    if (connection.writeBuffer.length > 0) {
                        flushWriteBuffer(connection);
                    }
                    
                    // Reject any pending read callbacks
                    while (connection.receiveCallbacks.length > 0) {
                        const callback = connection.receiveCallbacks.shift();
                        callback(new Uint8Array(0)); // Return empty data
                    }
                };

                // Connection Ä‘Ă£ Ä‘Æ°á»£c lÆ°u á»Ÿ trĂªn, khĂ´ng cáº§n lÆ°u láº¡i
                // Don't resolve here - wait for onopen
            } catch (error) {
                reject(error);
            }
        });
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeClose(lib, handle) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (connection && connection.ws) {
            connection.ws.close();
            socketConnections.delete(numHandle);
        }
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeIsConnected(lib, handle) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (!connection) return false;
        return connection.connected && !connection.closed;
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeRead(lib, handle, buffer, offset, length) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (!connection) {
            return -1;
        }
        
        if (connection.closed || !connection.connected) {
            return -1;
        }

        // Check if data is already available
        if (connection.receiveQueue.length > 0) {
            const data = connection.receiveQueue.shift();
            const bytesToCopy = Math.min(length, data.length);
            for (let i = 0; i < bytesToCopy; i++) {
                buffer[offset + i] = data[i];
            }
            // Put remaining data back to queue
            if (data.length > bytesToCopy) {
                connection.receiveQueue.unshift(data.slice(bytesToCopy));
            }
            return bytesToCopy;
        }

        // Wait for data asynchronously
        return new Promise((resolve) => {
            let timeoutId = null;
            
            const callback = (data) => {
                if (timeoutId) clearTimeout(timeoutId);
                if (connection.closed) {
                    resolve(-1);
                    return;
                }
                
                const bytesToCopy = Math.min(length, data.length);
                for (let i = 0; i < bytesToCopy; i++) {
                    buffer[offset + i] = data[i];
                }
                // Put remaining data back to queue
                if (data.length > bytesToCopy) {
                    connection.receiveQueue.unshift(data.slice(bytesToCopy));
                }
                resolve(bytesToCopy);
            };

            // Set timeout - náº¿u khĂ´ng cĂ³ data sau 30 giĂ¢y, return 0 (khĂ´ng pháº£i -1)
            timeoutId = setTimeout(() => {
                const index = connection.receiveCallbacks.indexOf(callback);
                if (index >= 0) {
                    connection.receiveCallbacks.splice(index, 1);
                }
                resolve(0); // Return 0 bytes instead of -1 to keep connection alive
            }, 30000); // 30 seconds timeout

            connection.receiveCallbacks.push(callback);
        });
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeWrite(lib, handle, buffer, offset, length) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (!connection) {
            throw new Error('Connection not found for handle: ' + numHandle);
        }
        if (connection.closed) {
            throw new Error('Connection closed');
        }

        // Extract bytes to send
        const dataToSend = new Uint8Array(buffer, offset, length);
        
        // Náº¿u length = 0, khĂ´ng lĂ m gĂ¬ (game cĂ³ thá»ƒ gá»i write vá»›i empty buffer)
        if (length === 0) {
            return;
        }
        
        // Append vĂ o write buffer
        const newBuffer = new Uint8Array(connection.writeBuffer.length + dataToSend.length);
        newBuffer.set(connection.writeBuffer, 0);
        newBuffer.set(dataToSend, connection.writeBuffer.length);
        connection.writeBuffer = newBuffer;
        
        // Clear timeout cÅ© náº¿u cĂ³
        if (connection.writeBufferTimeout) {
            clearTimeout(connection.writeBufferTimeout);
            connection.writeBufferTimeout = null;
        }
        
        // If not connected yet, queue the write
        if (!connection.connected) {
            // Buffer sáº½ Ä‘Æ°á»£c flush khi connected
            return;
        }
        
        // Flush ngay náº¿u buffer >= FLUSH_THRESHOLD (trĂ¡nh delay message lá»›n)
        if (connection.writeBuffer.length >= connection.FLUSH_THRESHOLD) {
            flushWriteBuffer(connection);
            return;
        }
        
        if (connection.writeBuffer.length >= 3) {
            const firstByte = connection.writeBuffer[0];
            const isMessageMinus27 = (firstByte === 0xE5 || firstByte === 229 || firstByte === -27 || (firstByte & 0xFF) === 0xE5);
            
            if (isMessageMinus27) {
                // Message -27: size = (size_high << 8) | size_low
                const sizeHigh = connection.writeBuffer[1] & 0xFF;
                const sizeLow = connection.writeBuffer[2] & 0xFF;
                const messageSize = (sizeHigh << 8) | sizeLow;
                const totalNeeded = 3 + messageSize; // cmd(1) + size(2) + data
                
                if (connection.writeBuffer.length < 5) {
                    // KHĂ”NG flush ngay, Ä‘á»£i timeout hoáº·c chunks tiáº¿p theo
                    // KhĂ´ng return, Ä‘á»ƒ set timeout
                } else if (connection.writeBuffer.length >= totalNeeded) {
                    // Buffer Ä‘á»§ data theo size Ä‘á»c Ä‘Æ°á»£c â†’ flush ngay
                    flushWriteBuffer(connection);
                    return;
                }
                // Buffer >= 5 bytes nhÆ°ng chÆ°a Ä‘á»§ theo size Ä‘á»c Ä‘Æ°á»£c â†’ Ä‘á»£i thĂªm chunks
            }
        }
        
        // Set timeout Ä‘á»ƒ flush sau FLUSH_TIMEOUT ms (gom cĂ¡c chunks nhá»)
        // QUAN TRá»ŒNG: Má»—i láº§n cĂ³ write má»›i, timeout Ä‘Æ°á»£c reset
        // Chá»‰ flush khi khĂ´ng cĂ²n write nĂ o trong FLUSH_TIMEOUT ms (Ä‘áº£m báº£o message hoĂ n chá»‰nh)
        connection.writeBufferTimeout = setTimeout(() => {
            // Kiá»ƒm tra láº¡i message -27 trÆ°á»›c khi flush
            // Náº¿u lĂ  message -27 vá»›i buffer < 5 bytes â†’ KHĂ”NG flush (Ä‘á»£i thĂªm chunks)
            // (Message -27 luĂ´n cĂ³ data, nĂªn buffer < 5 bytes cháº¯c cháº¯n lĂ  chÆ°a Ä‘á»§)
            if (connection.writeBuffer.length >= 3) {
                const firstByte = connection.writeBuffer[0];
                const isMessageMinus27 = (firstByte === 0xE5 || firstByte === 229 || firstByte === -27 || (firstByte & 0xFF) === 0xE5);
                
                if (isMessageMinus27) {
                    // Náº¿u buffer < 5 bytes â†’ KHĂ”NG flush, Ä‘á»£i thĂªm chunks
                    if (connection.writeBuffer.length < 5) {
                        // Reset timeout Ä‘á»ƒ Ä‘á»£i thĂªm chunks
                        // TÄƒng timeout lĂªn 4x (200ms) Ä‘á»ƒ Ä‘á»£i thĂªm chunks
                        connection.writeBufferTimeout = setTimeout(() => {
                            // Kiá»ƒm tra láº¡i láº§n ná»¯a
                            if (connection.writeBuffer.length >= 5) {
                                flushWriteBuffer(connection);
                            } else {
                                flushWriteBuffer(connection);
                            }
                        }, connection.FLUSH_TIMEOUT * 4); // Äá»£i thĂªm 4x timeout (200ms)
                        return;
                    }
                }
            }
            
            // Flush buffer
            flushWriteBuffer(connection);
        }, connection.FLUSH_TIMEOUT);
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeGetAddress(lib, handle) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (!connection) return '';
        return connection.ws.url.split('://')[1]?.split(':')[0] || '';
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeGetPort(lib, handle) {
        const numHandle = Number(handle); // Convert BigInt to Number
        const connection = socketConnections.get(numHandle);
        if (!connection) return 0;
        const url = connection.ws.url;
        const match = url.match(/:(\d+)/);
        return match ? parseInt(match[1]) : 0;
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeGetLocalAddress(lib, handle) {
        // WebSocket doesn't expose local address, return empty or use window.location.hostname
        return window.location.hostname || '';
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeGetLocalPort(lib, handle) {
        // WebSocket doesn't expose local port
        return 0;
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeGetSocketOption(lib, handle, option) {
        // Socket options are not fully supported in WebSocket
        return 0;
    },

    async Java_pl_zb3_freej2me_bridge_SocketConnectionImpl_nativeSetSocketOption(lib, handle, option, value) {
        // Socket options are not fully supported in WebSocket
        // Could implement timeout handling, etc. if needed
    },
};
