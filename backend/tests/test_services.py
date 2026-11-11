from app.services.contextual_adaptation import adapt_transcript
from app.services.language_analysis import analyze_transcript
from ml.data.prepare_dataset import normalize_transcript
from ml.evaluation.metrics import cer, switch_boundary_f1, wer


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


def test_context_is_conservative():
    assert adapt_transcript("i use python", "Programming", []) == "i use Python"
    assert adapt_transcript("i use pythons", "Programming", []) == "i use pythons"


def test_metrics():
    assert wer("a b", "a c") == 0.5
    assert cer("ab", "ac") == 0.5
    assert switch_boundary_f1(["hi", "en"], ["hi", "en"]) == 1
