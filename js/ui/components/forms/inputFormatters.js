import { parseFormattedNumber } from "../../../utils/formatters.js";

export function formatNumberInput(e) {
    const input = e.target;
    let selectionStart = input.selectionStart;
    const originalLength = input.value.length;
    const rawValue = parseFormattedNumber(input.value.replace(/[^0-9]/g, ''));


    if (isNaN(rawValue)) {
        input.value = '';
        return;
    }

    const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);

    if (input.value !== formattedValue) {
        input.value = formattedValue;
        const newLength = formattedValue.length;
        const diff = newLength - originalLength;
         const newPosition = Math.max(0, (selectionStart || 0) + diff);

        setTimeout(() => {
            try {
                input.setSelectionRange(newPosition, newPosition);
            } catch (err) {
                console.warn("Could not set cursor position:", err);
            }
        }, 0);
    }
}
