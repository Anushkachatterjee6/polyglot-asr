from app.services.contextual_adaptation import adapt_transcript
from app.services.language_analysis import analyze_transcript
from ml.data.prepare_dataset import normalize_transcript
from ml.evaluation.metrics import cer, lid_accuracy, normalize_for_evaluation, switch_boundary_f1, wer


def test_normalization_keeps_mixed_scripts():
    assert normalize_transcript("  मुझे   python  ") == "मुझे python"


def test_roman_hindi_is_not_assumed_english():
    sentence = "Aaj I am going to college because mera exam hai."
    words, hindi, english, switches = analyze_transcript(sentence)
    assert [word.text for word in words] == ["Aaj", "I", "am", "going", "to", "college", "because", "mera", "exam", "hai"]
    assert [word.language for word in words] == ["hi", "en", "en", "en", "en", "en", "en", "hi", "en", "hi"]
    assert (hindi, english, switches) == (3, 7, 4)
    assert hindi + english + sum(word.language == "other" for word in words) == len(words)


def test_devanagari_and_contractions_are_single_correctly_counted_tokens():
    sentence = "आज I'm going to college because मेरा exam है"
    words, hindi, english, switches = analyze_transcript(sentence)
    assert [word.text for word in words] == ["आज", "I'm", "going", "to", "college", "because", "मेरा", "exam", "है"]
    assert [word.language for word in words] == ["hi", "en", "en", "en", "en", "en", "hi", "en", "hi"]
    assert (hindi, english, switches) == (3, 6, 4)
    assert hindi + english + sum(word.language == "other" for word in words) == len(words)


def test_hinglish_word_classification_keeps_roman_hindi_and_english_separate():
    words, hindi, english, switches = analyze_transcript(
        "Actually mujhe kal college jaana hai because I have an exam."
    )
    assert [word.language for word in words] == ["en", "hi", "hi", "en", "hi", "hi", "en", "en", "en", "en", "en"]
    assert (hindi, english, switches) == (4, 7, 4)


def test_ambiguous_latin_token_is_unknown_not_forced_to_english():
    words, hindi, english, _ = analyze_transcript("mujhe qzxv hai")
    assert [word.language for word in words] == ["hi", "unknown", "hi"]
    assert (hindi, english) == (2, 0)


def test_context_corrects_close_machine_learning_terms_only():
    original = "I am studing machine learnin and fine tuneing the model for better inferense using neural netwoks."
    assert adapt_transcript(
        original,
        "Machine Learning",
        ["machine learning", "XLS-R", "fine-tuning", "inference"],
    ) == "I am studing machine learning and fine-tuning the model for better inference using neural network."


def test_context_uses_machine_learning_context_for_multiple_safe_typos():
    original = (
        "Machine lerning algorithms helps computers to identfy pattrens in large datasets "
        "and make accurate predictons without explict programming."
    )
    assert adapt_transcript(original, "Machine Learning", []) == (
        "Machine learning algorithms help computers to identify patterns in large datasets "
        "and make accurate predictions without explicit programming."
    )


def test_context_keeps_correct_and_non_vocabulary_words_unchanged():
    sentence = "I am studying machine learning and fine-tuning the model for better inference using neural network."
    assert adapt_transcript(sentence, "Machine Learning", ["machine learning", "XLS-R", "fine-tuning", "inference"]) == sentence
    assert adapt_transcript("i use pythons", "Programming", []) == "i use pythons"


def test_context_preserves_code_switching_while_correcting_terms():
    sentence = "मुझे machine learnin aur inferense improve karna hai."
    assert adapt_transcript(sentence, "Machine Learning", ["machine learning", "inference"]) == (
        "मुझे machine learning aur inference improve karna hai."
    )


def test_context_keeps_exact_canonicalisation():
    assert adapt_transcript("i use python", "Programming", []) == "i use Python"


def test_metrics():
    assert wer("a b", "a c") == 0.5
    assert cer("ab", "ac") == 0.5
    assert switch_boundary_f1(["hi", "en"], ["hi", "en"]) == 1
    assert lid_accuracy(["hi", "en"], ["hi", "hi"]) == 0.5
    assert lid_accuracy(["hi"], ["hi", "en"]) is None
    assert normalize_for_evaluation("Hello,  दुनिया!") == "hello दुनिया"
