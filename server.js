const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SECURITY
// ============================================
const SECRET_KEY = "PS263";

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Too many requests" }
});

const verifyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    message: { error: "Too many attempts" }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/api/', limiter);

// ============================================
// ORIGINAL AI ENGINE - SAME AS YOUR HTML
// ============================================

function getCats(records) {
    return records.map(r => {
        const num = parseInt(r.number || r.num || 0);
        return num >= 5 ? "BIG" : "SMALL";
    });
}

function getNums(records) {
    return records.map(r => parseInt(r.number || r.num || 0));
}

function norm(b, s) {
    const t = b + s;
    return t > 0 ? { big: b/t, small: s/t } : { big: 0.5, small: 0.5 };
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function fmt(v) {
    return (v * 100).toFixed(1) + "%";
}

// ===== LEVEL 1 - STAT AI =====
function multiDecayBayes(cats) {
    if (!cats.length) return { big: 0.5, small: 0.5 };
    var decayRates = [0.06, 0.15, 0.35];
    var weights = [0.25, 0.45, 0.30];
    var bigTotal = 0, smallTotal = 0, wTotal = 0;

    for (var d = 0; d < decayRates.length; d++) {
        var rate = decayRates[d], w = weights[d];
        var bw = 0, sw = 0, window = Math.min(40, cats.length);
        for (var i = 0; i < window; i++) {
            var wt = Math.exp(-rate * i);
            if (cats[i] === "BIG") bw += wt; else sw += wt;
        }
        var prior = 4;
        var pBig = (bw + prior * 0.5) / (bw + sw + prior);
        bigTotal += pBig * w;
        smallTotal += (1 - pBig) * w;
        wTotal += w;
    }
    return norm(bigTotal, smallTotal);
}

function markovCombined(cats) {
    if (cats.length < 2) return { big: cats[0] === "BIG" ? 0.52 : 0.48, small: 0 };
    var prior = 3;
    var results = [];

    var s1 = cats[0], b1 = 0, s1c = 0, n1 = 0;
    for (var i = 0; i < cats.length - 1; i++) {
        if (cats[i + 1] === s1) { n1++; if (cats[i] === "BIG") b1++; else s1c++; }
    }
    var p1 = n1 > 0 ? (b1 + prior * 0.5) / (n1 + prior) : 0.5;
    results.push({ big: p1, weight: n1 > 3 ? 0.35 : 0.20, samples: n1 });

    if (cats.length >= 3) {
        var s2 = cats[1].slice(0,1) + cats[0].slice(0,1);
        var b2 = 0, s2c = 0, n2 = 0;
        for (var i = 0; i < cats.length - 2; i++) {
            var hs = cats[i + 2].slice(0,1) + cats[i + 1].slice(0,1);
            if (hs === s2) { n2++; if (cats[i] === "BIG") b2++; else s2c++; }
        }
        var p2 = n2 > 0 ? (b2 + prior * 0.5) / (n2 + prior) : p1;
        results.push({ big: p2, weight: n2 > 2 ? 0.35 : 0.15, samples: n2 });
    }

    if (cats.length >= 4) {
        var s3 = cats[2].slice(0,1) + cats[1].slice(0,1) + cats[0].slice(0,1);
        var b3 = 0, n3 = 0;
        for (var i = 0; i < cats.length - 3; i++) {
            var hs = cats[i + 3].slice(0,1) + cats[i + 2].slice(0,1) + cats[i + 1].slice(0,1);
            if (hs === s3) { n3++; if (cats[i] === "BIG") b3++; }
        }
        var p3 = n3 > 0 ? (b3 + prior * 0.5) / (n3 + prior) : p1;
        results.push({ big: p3, weight: n3 > 1 ? 0.30 : 0.10, samples: n3 });
    }

    var bigS = 0, wT = 0;
    results.forEach(function(r) { bigS += r.big * r.weight; wT += r.weight; });
    var probs = norm(bigS, wT - bigS);
    return probs;
}

function freqImbalance(cats) {
    var windows = [10, 25, 50];
    var bigS = 0, wS = 0;
    windows.forEach(function(w, idx) {
        var slice = cats.slice(0, Math.min(w, cats.length));
        var bigC = slice.filter(function(c) { return c === "BIG"; }).length;
        var ratio = slice.length > 0 ? bigC / slice.length : 0.5;
        var weight = [0.5, 0.3, 0.2][idx];
        if (ratio > 0.55) {
            bigS += (1 - ratio) * weight * 2;
        } else if (ratio < 0.45) {
            bigS += ratio * weight * 2;
        } else {
            bigS += ratio * weight;
        }
        wS += weight;
    });
    return norm(bigS, wS - bigS);
}

function autocorrelation(cats) {
    if (cats.length < 10) return { big: 0.5, small: 0.5 };
    var same = 0, diff = 0;
    for (var i = 0; i < cats.length - 1; i++) {
        if (cats[i] === cats[i + 1]) same++; else diff++;
    }
    var autoCorr1 = same / (same + diff);
    var lastCat = cats[0];
    var bigP;
    if (autoCorr1 > 0.55) {
        bigP = lastCat === "BIG" ? 0.5 + (autoCorr1 - 0.5) * 0.8 : 0.5 - (autoCorr1 - 0.5) * 0.8;
    } else if (autoCorr1 < 0.45) {
        bigP = lastCat === "BIG" ? 0.5 - (0.5 - autoCorr1) * 0.8 : 0.5 + (0.5 - autoCorr1) * 0.8;
    } else {
        bigP = 0.5;
    }
    return { big: clamp(bigP, 0.3, 0.7), small: 1 - clamp(bigP, 0.3, 0.7) };
}

function streakHybrid(cats) {
    if (!cats.length) return { big: 0.5, small: 0.5 };
    var last = cats[0], streak = 1;
    for (var i = 1; i < cats.length; i++) { if (cats[i] === last) streak++; else break; }
    if (streak >= 5) {
        var rev = clamp(0.54 + (streak - 4) * 0.04, 0.54, 0.72);
        return last === "SMALL" ? { big: rev, small: 1 - rev } : { big: 1 - rev, small: rev };
    } else if (streak >= 3) {
        var rev = 0.53;
        return last === "SMALL" ? { big: rev, small: 1 - rev } : { big: 1 - rev, small: rev };
    } else if (streak === 2) {
        return last === "BIG" ? { big: 0.52, small: 0.48 } : { big: 0.48, small: 0.52 };
    } else {
        return last === "BIG" ? { big: 0.49, small: 0.51 } : { big: 0.51, small: 0.49 };
    }
}

function maCrossover(cats) {
    var w5 = Math.min(5, cats.length), w15 = Math.min(15, cats.length);
    if (w5 < 2) return { big: 0.5, small: 0.5 };
    var r5 = cats.slice(0, w5).filter(function(c) { return c === "BIG"; }).length / w5;
    var r15 = cats.slice(0, w15).filter(function(c) { return c === "BIG"; }).length / w15;
    var diff = r5 - r15;
    var bigP = 0.5 + clamp(diff * 1.5, -0.15, 0.15);
    return { big: bigP, small: 1 - bigP };
}

function backtestSubModels(cats) {
    var wins = [0,0,0,0,0,0], total = 0;
    var max = Math.min(25, Math.max(0, cats.length - 6));
    for (var i = 0; i < max; i++) {
        var actual = cats[i];
        var old = cats.slice(i + 1);
        var preds = [
            multiDecayBayes(old),
            markovCombined(old),
            freqImbalance(old),
            autocorrelation(old),
            streakHybrid(old),
            maCrossover(old)
        ];
        preds.forEach(function(p, idx) {
            if ((p.big >= p.small ? "BIG" : "SMALL") === actual) wins[idx]++;
        });
        total++;
    }
    if (total < 3) return { w1: 0.25, w2: 0.25, w3: 0.15, w4: 0.15, w5: 0.10, w6: 0.10 };
    var accs = wins.map(function(w) { return w / total; });
    var base = [0.22, 0.25, 0.15, 0.15, 0.13, 0.10];
    var rawW = base.map(function(b, i) { return b + accs[i] * 0.5; });
    var sum = rawW.reduce(function(a, b) { return a + b; }, 0);
    return { w1: rawW[0]/sum, w2: rawW[1]/sum, w3: rawW[2]/sum, w4: rawW[3]/sum, w5: rawW[4]/sum, w6: rawW[5]/sum };
}

function level1(cats) {
    var m1 = multiDecayBayes(cats);
    var m2 = markovCombined(cats);
    var m3 = freqImbalance(cats);
    var m4 = autocorrelation(cats);
    var m5 = streakHybrid(cats);
    var m6 = maCrossover(cats);

    var bt = backtestSubModels(cats);
    var rawBig = m1.big * bt.w1 + m2.big * bt.w2 + m3.big * bt.w3 + 
                 m4.big * bt.w4 + m5.big * bt.w5 + m6.big * bt.w6;
    var rawSmall = m1.small * bt.w1 + m2.small * bt.w2 + m3.small * bt.w3 + 
                   m4.small * bt.w4 + m5.small * bt.w5 + m6.small * bt.w6;
    var probs = norm(rawBig, rawSmall);
    return { big: probs.big, small: probs.small, name: "STAT AI" };
}

// ===== LEVEL 2 - DEEP AI =====
function multiPatternMatch(cats) {
    if (cats.length < 4) return { big: cats[0] === "BIG" ? 0.52 : 0.48, small: 0 };
    var bigS = 0, wS = 0;
    for (var pLen = 2; pLen <= Math.min(5, Math.floor(cats.length / 2)); pLen++) {
        var curPat = cats.slice(0, pLen).map(function(c) { return c.slice(0,1); }).join("");
        var bC = 0, sC = 0, n = 0;
        for (var i = pLen; i < cats.length - pLen; i++) {
            var hPat = cats.slice(i, i + pLen).map(function(c) { return c.slice(0,1); }).join("");
            if (hPat === curPat) { n++; if (cats[i - 1] === "BIG") bC++; else sC++; }
        }
        if (n > 0) {
            var prior = 2;
            var pB = (bC + prior * 0.5) / (n + prior);
            var weight = [0.25, 0.30, 0.25, 0.20][pLen - 2] * (1 + n * 0.1);
            bigS += pB * weight;
            wS += weight;
        }
    }
    if (wS === 0) return { big: 0.5, small: 0.5 };
    return norm(bigS, wS - bigS);
}

function cycleDetection(cats) {
    if (cats.length < 12) return { big: 0.5, small: 0.5 };
    var bestCycle = 0, bestScore = 0;
    for (var period = 2; period <= 8; period++) {
        var matches = 0, total = 0;
        for (var i = 0; i < cats.length - period; i++) {
            if (cats[i] === cats[i + period]) matches++;
            total++;
        }
        var score = total > 0 ? matches / total : 0.5;
        if (score > bestScore) { bestScore = score; bestCycle = period; }
    }
    if (bestScore > 0.58 && bestCycle > 0) {
        var predicted = cats[bestCycle - 1];
        return predicted === "BIG" ?
            { big: clamp(0.5 + (bestScore - 0.5) * 1.5, 0.5, 0.68), small: 0 } :
            { big: 0, small: clamp(0.5 + (bestScore - 0.5) * 1.5, 0.5, 0.68) };
    }
    return { big: 0.5, small: 0.5 };
}

function numberMarkov(records) {
    var nums = getNums(records);
    if (nums.length < 5) return { big: 0.5, small: 0.5 };
    var lastNum = nums[0];
    var bC = 0, sC = 0, n = 0;
    for (var i = 1; i < nums.length - 1; i++) {
        if (nums[i] === lastNum) { n++; if (nums[i - 1] >= 5) bC++; else sC++; }
    }
    for (var i = 1; i < nums.length - 1; i++) {
        if (Math.abs(nums[i] - lastNum) <= 1 && nums[i] !== lastNum) {
            n++; if (nums[i - 1] >= 5) bC++; else sC++;
        }
    }
    if (n === 0) return { big: lastNum >= 5 ? 0.52 : 0.48, small: 0 };
    var prior = 3;
    var pB = (bC + prior * 0.5) / (n + prior);
    return { big: pB, small: 1 - pB };
}

function alternationAnalysis(cats) {
    if (cats.length < 8) return { big: 0.5, small: 0.5 };
    var rates = [];
    [8, 15, 25].forEach(function(w) {
        var slice = cats.slice(0, Math.min(w, cats.length));
        var alt = 0;
        for (var i = 0; i < slice.length - 1; i++) {
            if (slice[i] !== slice[i + 1]) alt++;
        }
        rates.push(slice.length > 1 ? alt / (slice.length - 1) : 0.5);
    });
    var avgRate = (rates[0] * 0.5 + rates[1] * 0.3 + rates[2] * 0.2);
    var last = cats[0];
    if (avgRate > 0.6) {
        return last === "BIG" ?
            { big: clamp(0.5 - (avgRate - 0.5) * 0.8, 0.3, 0.5), small: 0 } :
            { big: clamp(0.5 + (avgRate - 0.5) * 0.8, 0.5, 0.7), small: 0 };
    } else if (avgRate < 0.4) {
        return last === "BIG" ?
            { big: clamp(0.5 + (0.5 - avgRate) * 0.8, 0.5, 0.7), small: 0 } :
            { big: clamp(0.5 - (0.5 - avgRate) * 0.8, 0.3, 0.5), small: 0 };
    }
    return { big: 0.5, small: 0.5 };
}

function volatilityCluster(cats) {
    if (cats.length < 10) return { big: 0.5, small: 0.5 };
    var vol5 = 0, vol15 = 0;
    for (var i = 0; i < Math.min(5, cats.length - 1); i++) {
        if (cats[i] !== cats[i + 1]) vol5++;
    }
    for (var i = 0; i < Math.min(15, cats.length - 1); i++) {
        if (cats[i] !== cats[i + 1]) vol15++;
    }
    var rv5 = vol5 / Math.min(4, cats.length - 1);
    var last = cats[0];
    if (rv5 > 0.7) {
        return last === "BIG" ? { big: 0.42, small: 0.58 } : { big: 0.58, small: 0.42 };
    } else if (rv5 < 0.3) {
        return last === "BIG" ? { big: 0.58, small: 0.42 } : { big: 0.42, small: 0.58 };
    }
    return { big: 0.5, small: 0.5 };
}

function consensusVote(cats, records) {
    var models = [
        multiPatternMatch(cats),
        cycleDetection(cats),
        numberMarkov(records),
        alternationAnalysis(cats),
        volatilityCluster(cats)
    ];
    var bigVotes = 0, smallVotes = 0, bigConf = 0, smallConf = 0;
    models.forEach(function(m) {
        var conf = Math.abs(m.big - m.small);
        if (m.big >= m.small) { bigVotes++; bigConf += conf; }
        else { smallVotes++; smallConf += conf; }
    });
    var bigP = (bigVotes + bigConf * 2) / (bigVotes + smallVotes + (bigConf + smallConf) * 2);
    return { big: clamp(bigP, 0.25, 0.75), small: 1 - clamp(bigP, 0.25, 0.75), bigVotes, smallVotes, total: models.length };
}

function backtestL2(cats, records) {
    var wins = [0,0,0,0,0,0], total = 0;
    var max = Math.min(20, Math.max(0, cats.length - 8));
    for (var i = 0; i < max; i++) {
        var actual = cats[i];
        var oC = cats.slice(i + 1);
        var oR = records.slice(i + 1);
        var preds = [
            multiPatternMatch(oC),
            cycleDetection(oC),
            numberMarkov(oR),
            alternationAnalysis(oC),
            volatilityCluster(oC),
            consensusVote(oC, oR)
        ];
        preds.forEach(function(p, idx) {
            if ((p.big >= p.small ? "BIG" : "SMALL") === actual) wins[idx]++;
        });
        total++;
    }
    if (total < 3) return { w1: 0.22, w2: 0.18, w3: 0.18, w4: 0.15, w5: 0.12, w6: 0.15 };
    var accs = wins.map(function(w) { return w / total; });
    var base = [0.22, 0.18, 0.18, 0.15, 0.12, 0.15];
    var rawW = base.map(function(b, i) { return b + accs[i] * 0.5; });
    var sum = rawW.reduce(function(a, b) { return a + b; }, 0);
    return { w1: rawW[0]/sum, w2: rawW[1]/sum, w3: rawW[2]/sum, w4: rawW[3]/sum, w5: rawW[4]/sum, w6: rawW[5]/sum };
}

function level2(cats, records) {
    var d1 = multiPatternMatch(cats);
    var d2 = cycleDetection(cats);
    var d3 = numberMarkov(records);
    var d4 = alternationAnalysis(cats);
    var d5 = volatilityCluster(cats);
    var d6 = consensusVote(cats, records);

    var bt = backtestL2(cats, records);
    var rawBig = d1.big * bt.w1 + d2.big * bt.w2 + d3.big * bt.w3 + 
                 d4.big * bt.w4 + d5.big * bt.w5 + d6.big * bt.w6;
    var rawSmall = d1.small * bt.w1 + d2.small * bt.w2 + d3.small * bt.w3 + 
                   d4.small * bt.w4 + d5.small * bt.w5 + d6.small * bt.w6;
    var probs = norm(rawBig, rawSmall);
    return { big: probs.big, small: probs.small, name: "DEEP AI", votes: d6 };
}

// ===== MASTER ENGINE =====
function getPrediction(records) {
    var cats = getCats(records);
    var l1 = level1(cats);
    var l2 = level2(cats, records);

    var l1W = 0, l2W = 0, metaN = 0;
    var metaMax = Math.min(20, Math.max(0, cats.length - 8));
    for (var i = 0; i < metaMax; i++) {
        var actual = cats[i];
        var oC = cats.slice(i + 1);
        var oR = records.slice(i + 1);
        var ol1 = level1(oC);
        var ol2 = level2(oC, oR);
        if ((ol1.big >= ol1.small ? "BIG" : "SMALL") === actual) l1W++;
        if ((ol2.big >= ol2.small ? "BIG" : "SMALL") === actual) l2W++;
        metaN++;
    }

    var l1Weight, l2Weight;
    if (metaN < 5) {
        l1Weight = 0.45; l2Weight = 0.55;
    } else {
        var l1Acc = l1W / metaN, l2Acc = l2W / metaN;
        l1Weight = 0.35 + l1Acc * 0.15;
        l2Weight = 0.35 + l2Acc * 0.15;
        var tw = l1Weight + l2Weight;
        l1Weight /= tw; l2Weight /= tw;
    }

    var rawBig = l1.big * l1Weight + l2.big * l2Weight;
    var rawSmall = l1.small * l1Weight + l2.small * l2Weight;
    var probs = norm(rawBig, rawSmall);

    var bigC = cats.slice(0, 30).filter(function(c) { return c === "BIG"; }).length;
    var p = bigC / Math.min(30, cats.length);
    var ent = (p > 0 && p < 1) ? -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)) : 0;
    var chaos = clamp((ent - 0.85) / 0.15, 0, 1);
    probs.big = probs.big * (1 - chaos * 0.15) + 0.5 * chaos * 0.15;
    probs.small = 1 - probs.big;

    var confidence = Math.max(probs.big, probs.small);
    var prediction = probs.big >= probs.small ? "BIG" : "SMALL";

    var l1Pred = l1.big >= l1.small ? "BIG" : "SMALL";
    var l2Pred = l2.big >= l2.small ? "BIG" : "SMALL";
    var bothAgree = l1Pred === l2Pred;

    if (bothAgree) {
        confidence = Math.min(confidence + 0.03, 0.85);
    }

    return {
        prediction: prediction,
        bigProbability: probs.big,
        smallProbability: probs.small,
        confidence: confidence,
        status: bothAgree ? "STRONG AI SIGNAL" : "AI ACTIVE",
        l1: l1, l2: l2,
        l1Pred: l1Pred, l2Pred: l2Pred,
        l1Conf: Math.max(l1.big, l1.small),
        l2Conf: Math.max(l2.big, l2.small),
        l1Weight: l1Weight, l2Weight: l2Weight,
        bothAgree: bothAgree,
        votes: l2.votes || { bigVotes: 0, smallVotes: 0, total: 0 },
        metaSamples: metaN
    };
}

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api/verify-key', verifyLimiter, (req, res) => {
    const userKey = req.query.key;
    if (!userKey || typeof userKey !== 'string') {
        return res.status(400).json({ valid: false, error: "Key is required" });
    }
    const trimmedKey = userKey.trim();
    if (trimmedKey.length < 3) {
        return res.status(400).json({ valid: false, error: "Key must be at least 3 characters" });
    }
    const isValid = trimmedKey === SECRET_KEY;
    res.json({ valid: isValid });
});

// POST endpoint - HTML se data lega
app.post('/api/predict-from-html', (req, res) => {
    const userKey = req.body.key;
    const records = req.body.records;
    const lastProcessedPeriod = req.body.lastProcessedPeriod || null;
    
    if (!userKey || userKey.trim() !== SECRET_KEY) {
        return res.status(401).json({ error: "Invalid Key" });
    }
    
    if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "No records provided" });
    }

    const latest = records[0];
    const latestIssue = latest.issueNumber || latest.issue || "------";
    const latestNumber = parseInt(latest.number || 0);

    // Check if period changed
    const periodChanged = lastProcessedPeriod !== latestIssue;

    // AI Prediction
    const result = getPrediction(records);
    
    // 🔥 CORRECT: Last period + 1 = Current period
    let currentPeriod = "------";
    try {
        const currentNum = parseInt(latestIssue);
        if (!isNaN(currentNum)) {
            currentPeriod = String(currentNum + 1);
        }
    } catch(e) {
        currentPeriod = "------";
    }

    res.json({
        prediction: result.prediction,
        confidence: fmt(result.confidence),
        status: result.status,
        currentPeriod: currentPeriod,  // Last period + 1
        latestResult: {
            issue: latestIssue,
            number: latestNumber,
            category: latestNumber >= 5 ? "BIG" : "SMALL"
        },
        periodChanged: periodChanged,
        level1: {
            name: result.l1.name,
            big: fmt(result.l1.big),
            small: fmt(result.l1.small)
        },
        level2: {
            name: result.l2.name,
            big: fmt(result.l2.big),
            small: fmt(result.l2.small)
        },
        bothAgree: result.bothAgree,
        l1Pred: result.l1Pred,
        l2Pred: result.l2Pred,
        l1Conf: fmt(result.l1Conf),
        l2Conf: fmt(result.l2Conf),
        votes: result.votes
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: "online", 
        timestamp: new Date().toISOString(),
        version: "PS PVT MOD V23"
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 PS PVT MOD Server running on http://localhost:${PORT}`);
    console.log(`🔑 Default Key: PS263`);
    console.log(`🔄 Server receives data from HTML (browser API call)`);
    console.log(`✅ Period = Last Period + 1 (auto update)`);
});
