const PLACEHOLDER = /\{([^{}]+)\}/gu;

const CONVERSION = /%([0-9]*)([sd%])/gu;

export function vformat(template, ...args) {
    let i = 0;
    return String(template).replace(CONVERSION, (_whole, width, spec) => {
        if (spec === '%')
            return '%';
        const v = args[i++];
        if (spec === 'd') {
            let s = String(Math.trunc(Number(v)));
            if (width)
                s = s.padStart(Number(width), width.startsWith('0') ? '0' : ' ');
            return s;
        }
        return String(v);
    });
}

export function substitute(template, values) {
    const get = values instanceof Map
        ? (k) => (values.has(k) ? values.get(k) : null)
        : (k) => (Object.hasOwn(values, k) ? values[k] : null);

    return template.replace(PLACEHOLDER, (whole, key) => {
        const v = get(key);
        return v === null || v === undefined ? whole : String(v);
    });
}

export function tooltipRows(template, values) {
    if (template === null || template === undefined || template.trim() === '')
        return [];

    const lines = substitute(template, values).split('\n');
    if (lines.length && lines[0] === '')
        lines.shift();
    if (lines.length && lines[lines.length - 1] === '')
        lines.pop();

    return lines.map(text => ({kind: 'text', text}));
}

function pad2(n) {
    return n < 10 ? `0${n}` : `${n}`;
}

export function localTimeHm(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const CURRENCY_SYMBOLS = Object.freeze({USD: '$', BRL: 'R$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥'});

// The one table deciding what a currency looks like; `currency` null is legacy USD.
// An unknown code trails the number instead of borrowing a wrong symbol.
export function withCurrency(sign, number, currency) {
    const symbol = currency === null ? '$' : CURRENCY_SYMBOLS[currency];
    return symbol ? `${sign}${symbol}${number}` : `${sign}${number} ${currency}`;
}

// The sign sits ahead of the symbol (-$5.71) and is decided from the rounded
// magnitude, so neither -0 nor a sub-cent debt reads as -$0.00.
export function formatMoney(amount, currency = 'USD') {
    const magnitude = Math.abs(amount).toFixed(2);
    const sign = amount < 0 && magnitude !== '0.00' ? '-' : '';
    return withCurrency(sign, magnitude, currency);
}
