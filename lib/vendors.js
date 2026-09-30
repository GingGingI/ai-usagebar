export const VENDOR_IDS = Object.freeze([
    'anthropic',
    'openai',
    'zai',
    'openrouter',
    'deepseek',
    'kimi',
    'ollama',
    'custom',
]);

export const VENDOR_LABELS = Object.freeze([
    'Anthropic',
    'OpenAI',
    'Z.AI',
    'OpenRouter',
    'DeepSeek',
    'Kimi',
    'Ollama',
    'Custom',
]);

export function isVendorId(s) {
    return VENDOR_IDS.includes(s);
}

// The custom provider is labelled by the name the user gave it.
export function vendorLabel(id, config = null) {
    if (id === 'custom' && config?.vendors?.custom?.name)
        return config.vendors.custom.name;
    const i = VENDOR_IDS.indexOf(id);
    return i === -1 ? id : VENDOR_LABELS[i];
}
