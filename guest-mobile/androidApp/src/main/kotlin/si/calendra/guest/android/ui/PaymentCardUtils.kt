package si.calendra.guest.android.ui

enum class PaymentCardBrand(val displayName: String) {
    Visa("Visa"),
    Mastercard("Mastercard"),
    Amex("American Express"),
    Discover("Discover"),
    Diners("Diners Club"),
    Jcb("JCB"),
    UnionPay("UnionPay"),
    Unknown("Card");

    companion object {
        fun fromDisplayName(raw: String): PaymentCardBrand {
            val t = raw.trim()
            return entries.firstOrNull { it.displayName.equals(t, ignoreCase = true) } ?: Unknown
        }

        fun fromPanDigits(d: String): PaymentCardBrand {
            if (d.isEmpty()) return Unknown
            return when {
                d.startsWith("4") -> Visa
                d.startsWith("34") || d.startsWith("37") -> Amex
                d.startsWith("35") && d.length >= 2 && d[1] in '1'..'8' -> Jcb
                d.startsWith("62") -> UnionPay
                d.startsWith("30") || d.startsWith("36") || d.startsWith("38") || d.startsWith("39") -> Diners
                d.startsWith("6011") || d.startsWith("65") ||
                    (d.length >= 3 && d.take(3).toIntOrNull()?.let { it in 644..649 } == true) -> Discover
                d.startsWith("51") || d.startsWith("52") || d.startsWith("53") ||
                    d.startsWith("54") || d.startsWith("55") -> Mastercard
                d.length >= 4 -> {
                    val four = d.take(4).toIntOrNull() ?: return Unknown
                    if (four in 2221..2720) Mastercard else Unknown
                }
                else -> Unknown
            }
        }
    }
}

object PaymentCardUtils {
    private const val MAX_PAN_DIGITS = 19

    fun digitsOnlyPan(raw: String): String = raw.filter { it.isDigit() }.take(MAX_PAN_DIGITS)

    fun formatGroupedPan(digits: String): String = buildString {
        digits.forEachIndexed { i, c ->
            if (i > 0 && i % 4 == 0) append(' ')
            append(c)
        }
    }

    fun luhnValid(digits: String): Boolean {
        if (digits.length < 2) return false
        var sum = 0
        var alternate = false
        for (i in digits.length - 1 downTo 0) {
            var n = digits[i].digitToIntOrNull() ?: return false
            if (alternate) {
                n *= 2
                if (n > 9) n -= 9
            }
            sum += n
            alternate = !alternate
        }
        return sum % 10 == 0
    }

    fun isCompleteValidPan(digits: String): Boolean {
        if (digits.length < 13 || digits.length > MAX_PAN_DIGITS) return false
        if (!luhnValid(digits)) return false
        val brand = PaymentCardBrand.fromPanDigits(digits)
        val okLength = when (brand) {
            PaymentCardBrand.Amex -> digits.length == 15
            PaymentCardBrand.Diners -> digits.length == 14 || digits.length == 16
            PaymentCardBrand.Visa -> digits.length in setOf(13, 16, 19)
            PaymentCardBrand.Mastercard, PaymentCardBrand.Discover, PaymentCardBrand.Jcb,
            PaymentCardBrand.UnionPay -> digits.length in 16..MAX_PAN_DIGITS
            PaymentCardBrand.Unknown -> digits.length in 16..MAX_PAN_DIGITS
        }
        return okLength
    }

    fun parseExpiryMmYy(text: String): Pair<Int, Int>? {
        val m = Regex("""^(0[1-9]|1[0-2])/(\d{2})$""").matchEntire(text.trim()) ?: return null
        val mm = m.groupValues[1].toInt()
        val yy = m.groupValues[2].toInt()
        return mm to yy
    }

    fun expiryIsValid(text: String, nowYearFull: Int, nowMonth: Int): Boolean {
        val (mm, yyTwo) = parseExpiryMmYy(text) ?: return false
        val yyFull = 2000 + yyTwo
        return when {
            yyFull > nowYearFull -> true
            yyFull < nowYearFull -> false
            else -> mm >= nowMonth
        }
    }

    fun formatExpiryInput(rawNew: String): String {
        val digits = rawNew.filter { it.isDigit() }.take(4)
        return when (digits.length) {
            0 -> ""
            1 -> if (digits[0] > '1') "0${digits[0]}/" else digits
            2 -> {
                val m = digits.toIntOrNull() ?: return digits
                if (m == 0 || m > 12) digits.dropLast(1) else "$digits/"
            }
            else -> "${digits.take(2)}/${digits.drop(2).take(2)}"
        }
    }
}
