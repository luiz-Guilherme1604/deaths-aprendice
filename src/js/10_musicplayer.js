

"use strict";




let CPlayer = function() {

    
    let osc_sin = function (value) {
        return Math.sin(value * 6.283184);
    };

    let osc_saw = function (value) {
        return 2 * (value % 1) - 1;
    };

    let osc_square = function (value) {
        return (value % 1) < 0.5 ? 1 : -1;
    };

    let osc_tri = function (value) {
        let v2 = (value % 1) * 4;
        if(v2 < 2) return v2 - 1;
        return 3 - v2;
    };

    let getnotefreq = function (n) {
        
        return 0.003959503758 * (2 ** ((n - 128) / 12));
    };

    let createNote = function (instr, n, rowLen) {
        let osc1 = mOscillators[instr.i[0]],
            o1vol = instr.i[1],
            o1xenv = instr.i[3]/32,
            osc2 = mOscillators[instr.i[4]],
            o2vol = instr.i[5],
            o2xenv = instr.i[8]/32,
            noiseVol = instr.i[9],
            attack = instr.i[10] * instr.i[10] * 4,
            sustain = instr.i[11] * instr.i[11] * 4,
            release = instr.i[12] * instr.i[12] * 4,
            releaseInv = 1 / release,
            expDecay = -instr.i[13]/16,
            arp = instr.i[14],
            arpInterval = rowLen * (2 **(2 - instr.i[15]));

        let noteBuf = new Int32Array(attack + sustain + release);

        
        let c1 = 0, c2 = 0;

        
        let j, j2, e, t, rsample, o1t, o2t;

        
        for (j = 0, j2 = 0; j < attack + sustain + release; j++, j2++) {
            if (j2 >= 0) {
               
                arp = (arp >> 8) | ((arp & 255) << 4);
                j2 -= arpInterval;

                
                o1t = getnotefreq(n + (arp & 15) + instr.i[2] - 128);
                o2t = getnotefreq(n + (arp & 15) + instr.i[6] - 128) * (1 + 0.0008 * instr.i[7]);
            }

            
            e = 1;
            if (j < attack) {
                e = j / attack;
            } else if (j >= attack + sustain) {
                e = (j - attack - sustain) * releaseInv;
                e = (1 - e) * (3 ** (expDecay * e));
            }

            
            c1 += o1t * e ** o1xenv;
            rsample = osc1(c1) * o1vol;

            
            c2 += o2t * e ** o2xenv;
            rsample += osc2(c2) * o2vol;

            
            if (noiseVol) {
                rsample += (2 * Math.random() - 1) * noiseVol;
            }

            
            noteBuf[j] = (80 * rsample * e) | 0;
        }

        return noteBuf;
    };


    
    
    let mOscillators = [
        osc_sin,
        osc_square,
        osc_saw,
        osc_tri
    ];

    
    let mSong, mLastRow, mCurrentCol, mNumWords, mMixBuf;


   
    this.init = function (song) {
       
        mSong = song;

       
        mLastRow = song.endPattern;
        mCurrentCol = 0;

       
        mNumWords =  song.rowLen * song.patternLen * (mLastRow + 1) * 2;

       
        mMixBuf = new Int32Array(mNumWords);
    };
    
    this.generate = function () {
        
        let i, j, b, p, row, col, n, cp,
            k, t, lfor, e, x, rsample, rowStartSample, f, da;

        
        let chnBuf = new Int32Array(mNumWords),
            instr = mSong.songData[mCurrentCol],
            rowLen = mSong.rowLen,
            patternLen = mSong.patternLen;

       
        let low = 0, band = 0, high;
        let lsample, filterActive = false;

       
        let noteCache = [];

         
         for (p = 0; p <= mLastRow; ++p) {
            cp = instr.p[p];

            
            for (row = 0; row < patternLen; ++row) {
               
                let cmdNo = cp ? instr.c[cp - 1].f[row] : 0;
                if (cmdNo) {
                    instr.i[cmdNo - 1] = instr.c[cp - 1].f[row + patternLen] || 0;

                    
                    if (cmdNo < 17) {
                        noteCache = [];
                    }
                }

                
                let oscLFO = mOscillators[instr.i[16]],
                    lfoAmt = instr.i[17] / 512,
                    lfoFreq = (2 ** (instr.i[18] - 9)) / rowLen,
                    fxLFO = instr.i[19],
                    fxFilter = instr.i[20],
                    fxFreq = instr.i[21] * 43.23529 * 3.141592 / 44100,
                    q = 1 - instr.i[22] / 255,
                    dist = instr.i[23] * 1e-5,
                    drive = instr.i[24] / 32,
                    panAmt = instr.i[25] / 512,
                    panFreq = 6.283184 * (2 ** (instr.i[26] - 9)) / rowLen,
                    dlyAmt = instr.i[27] / 255,
                    dly = instr.i[28] * rowLen & ~1;  

                
                rowStartSample = (p * patternLen + row) * rowLen;

               
                for (col = 0; col < 4; ++col) {
                    n = cp ? instr.c[cp - 1].n[row + col * patternLen] : 0;
                    if (n) {
                        if (!noteCache[n]) {
                            noteCache[n] = createNote(instr, n, rowLen);
                        }

                       
                        let noteBuf = noteCache[n];
                        for (j = 0, i = rowStartSample * 2; j < noteBuf.length; j++, i += 2) {
                          chnBuf[i] += noteBuf[j];
                        }
                    }
                }

               
                for (j = 0; j < rowLen; j++) {
                    
                    k = (rowStartSample + j) * 2;
                    rsample = chnBuf[k];

                    
                    if (rsample || filterActive) {
                       
                        f = fxFreq;
                        if (fxLFO) {
                            f *= oscLFO(lfoFreq * k) * lfoAmt + 0.5;
                        }
                        f = 1.5 * Math.sin(f);
                        low += f * band;
                        high = q * (rsample - band) - low;
                        band += f * high;
                        rsample = fxFilter == 3 ? band : fxFilter == 1 ? high : low;

                        
                        if (dist) {
                            rsample *= dist;
                            rsample = rsample < 1 ? rsample > -1 ? osc_sin(rsample*.25) : -1 : 1;
                            rsample /= dist;
                        }


                        rsample *= drive;

                       
                        filterActive = rsample * rsample > 1e-5;

                        
                        t = Math.sin(panFreq * k) * panAmt + 0.5;
                        lsample = rsample * (1 - t);
                        rsample *= t;
                    } else {
                        lsample = 0;
                    }

                    
                    if (k >= dly) {
                       
                        lsample += chnBuf[k-dly+1] * dlyAmt;

                        
                        rsample += chnBuf[k-dly] * dlyAmt;
                    }

                    
                    chnBuf[k] = lsample | 0;
                    chnBuf[k+1] = rsample | 0;

                    
                    mMixBuf[k] += lsample | 0;
                    mMixBuf[k+1] += rsample | 0;
                }
            }
        }


        mCurrentCol++;
        return mCurrentCol / mSong.numChannels;
    };

    
    this.createAudioBuffer = function(context) {
        let buffer = context.createBuffer(2, mNumWords / 2, 44100);
        for (let i = 0; i < 2; i ++) {
            let data = buffer.getChannelData(i);
            for (let j = i; j < mNumWords; j += 2) {
                data[j >> 1] = mMixBuf[j] / 65536;
            }
        }
        return buffer;
    };
    
    
    this.createWave = function() {
        
        let headerLen = 44;
        let l1 = headerLen + mNumWords * 2 - 8;
        let l2 = l1 - 36;
        let wave = new Uint8Array(headerLen + mNumWords * 2);
        wave.set(
            [82,73,70,70,
             l1 & 255,(l1 >> 8) & 255,(l1 >> 16) & 255,(l1 >> 24) & 255,
             87,65,86,69,102,109,116,32,16,0,0,0,1,0,2,0,
             68,172,0,0,16,177,2,0,4,0,16,0,100,97,116,97,
             l2 & 255,(l2 >> 8) & 255,(l2 >> 16) & 255,(l2 >> 24) & 255]
        );

       
        for (let i = 0, idx = headerLen; i < mNumWords; ++i) {
            
            let y = mMixBuf[i];
            y = y < -32767 ? -32767 : (y > 32767 ? 32767 : y);
            wave[idx++] = y & 255;
            wave[idx++] = (y >> 8) & 255;
        }

        
        return wave;
    };

    
    this.getData = function(t, n) {
        let i = 2 * Math.floor(t * 44100);
        let d = new Array(n);
        for (let j = 0; j < 2*n; j += 1) {
            let k = i + j;
            d[j] = t > 0 && k < mMixBuf.length ? mMixBuf[k] / 32768 : 0;
        }
        return d;
    };
};
