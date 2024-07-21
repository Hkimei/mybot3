const { ClarifaiStub, grpc } = require("clarifai-nodejs-grpc");
const fs = require("fs");
const kuromoji = require('kuromoji');

const stub = ClarifaiStub.grpc();
const metadata = new grpc.Metadata();
const api_key = "0c3ae9305e72401dba9f741a1cb2c42f";
metadata.set("authorization", "Key " + api_key);

const breedTranslations = {
  "AmericanShorthair": "アメリカンショートヘア",
  "Ragdoll": "ラグドール",
  "Persian": "ペルシャン",
  "BritishShorthair": "ブリティッシュショートヘア",
  "Bengal": "ベンガル",
  "MaineCoon": "メイン・クーン・キャット",
  "Abyssinian": "アビシニアン",
  "Siamese": "サイアミーズ",
  "ShibaInu": "柴犬",
  "Corgi": "コーギー",
  "Husky": "ハスキー",
  "Labrador": "ラブラドール",
  "GoldenRetriever": "ゴールデンレトリバー",
  "BorderCollie": "ボーダーコリー",
  "Samoyed": "サモエド",
  "MiniatureDachshund": "ミニチュアダックスフンド"
};

const compliments = {
  "AmericanShorthair": "アメリカンショートヘアはその優雅な姿が魅力的だよ！",
  "Ragdoll": "ラグドールは、そのおおらかな性格で知られているよ！",
  "Persian": "ペルシャンのふわふわの毛並みは本当に美しい！",
  "BritishShorthair": "ブリティッシュショートヘアの丸い顔がとても愛らしい！",
  "Bengal": "ベンガルの野生的な模様はとてもユニーク！",
  "MaineCoon": "メイン・クーン・キャットはその大きな体と優しい性格が魅力だ！",
  "Abyssinian": "アビシニアンの活発な性格とスリムな体形が素晴らしい！",
  "Siamese": "サイアミーズはその美しい青い目とおしゃべりな性格が特徴だ！",
  "ShibaInu": "柴犬の元気な性格と忠実さが素敵だ！",
  "Corgi": "コーギーの短い足と元気な性格が魅力的だ！",
  "Husky": "ハスキーの美しい青い目と力強い体力が素晴らしい！",
  "Labrador": "ラブラドールの友好的な性格と愛らしい姿が最高だ！",
  "GoldenRetriever": "ゴールデンレトリバーの優しい性格と美しい毛並みが素晴らしい！",
  "BorderCollie": "ボーダーコリーの知能と活発な性格がとても魅力的だよ！",
  "Samoyed": "サモエドの明るい笑顔とふわふわの毛が素敵だよ！",
  "MiniatureDachshund": "ミニチュアダックスフンドの小さな体と元気な性格が愛らしい！"
};

// トークルームごとの状態を保持するためのオブジェクト
const state = {};

module.exports = (robot) => {
  // 形態素解析のセットアップ
  const builder = kuromoji.builder({
    dicPath: 'node_modules/kuromoji/dict'
  });

  robot.respond(/こんにちは$/i, (res) => {
    const roomId = res.message.room;
    res.send(`あなたのトークルームIDは: ${roomId}`);
  });

  robot.respond(/一緒に会話しよう$/i, (res) => {
    const roomId = res.message.room;

    if (!state[roomId]) {
      state[roomId] = {
        questionSentId: null,
        selectedOption: null,
        waitingForBreed: false // ユーザーからの新しい品種入力を待つ状態を追加
      };
    }

    res.send({
      question: 'あなたは猫派か、犬派か',
      options: ['猫', '犬'],
      onsend: (sent) => {
        state[roomId].questionSentId = sent.message.id;
      }
    });
  });

  robot.respond('select', (res) => {
    const roomId = res.message.room;

    if (!state[roomId]) {
      res.send("エラー: トークルームの状態が見つかりません。");
      return;
    }

    if (res.json.response === null) {
      res.send(`Your question is ${res.json.question}.`);
    } else {
      const selectedOption = res.json.options[res.json.response];
      state[roomId].selectedOption = selectedOption;
      state[roomId].waitingForBreed = false; // 画像解析後にリセット

      res.send({
        text: `あなたは ${selectedOption} が好きだよね。好きな ${selectedOption} の写真を見せてもいい？
        （今回判別できる猫：アメリカンショートヘア、ラグドール、ペルシャン、ブリティッシュショートヘア、ベンガル、メイン・クーン・キャット、アビシニアン、サイアミーズ。
        また、判別できる犬：柴犬、コーギー、ハスキー、ラブラドール、ゴールデンレトリバー、ボーダーコリー、サモエド、ミニチュアダックスフンド）
        判別できない猫(犬)後で名前を入力してください。`,
        onsend: (sent) => {
          res.send({
            close_select: state[roomId].questionSentId
          });
        }
      });
    }
  });

  const onfile = (res, file) => {
    const roomId = res.message.room;

    if (!state[roomId] || !state[roomId].selectedOption) {
      res.send("エラー: トークルームの状態が見つかりません。");
      return;
    }

    res.download(file, (path) => {
      const imageBytes = fs.readFileSync(path, { encoding: "base64" });

      const modelId = state[roomId].selectedOption === '猫' ? "catbreeds-model" : "dogbreeds-model";

      stub.PostModelOutputs(
        {
          model_id: modelId,
          inputs: [{ data: { image: { base64: imageBytes } } }]
        },
        metadata,
        (err, response) => {
          if (err) {
            res.send("Error: " + err);
            return;
          }

          if (response.status.code !== 10000) {
            res.send("Received failed status: " + response.status.description + "\n" + response.status.details + "\n" + response.status.code);
            return;
          }

          const topConcept = response.outputs[0].data.concepts.reduce((prev, current) => {
            return (prev.value > current.value) ? prev : current;
          });

          if (topConcept.value > 0.5) {
            const japaneseName = breedTranslations[topConcept.name] || topConcept.name;
            const compliment = compliments[topConcept.name] || "素敵ですね！";

            res.send(`なるほど、"${japaneseName}"が好きだよね！ ${compliment}`);
            state[roomId].waitingForBreed = true; // 画像解析後にリセット
          } else {
            const breedPrompt = state[roomId].selectedOption === '猫' ? "猫" : "犬";
            res.send(`すみません、この${breedPrompt}の種類がわかりません。教えてもいいですか？`);

            state[roomId].waitingForBreed = true; // ユーザーからの新しい品種入力を待つ状態にする
          }
        }
      );
    });
  };

  robot.respond('file', (res) => {
    onfile(res, res.json);
  });

  // 画像解析後の対話機能
  robot.respond(/(.+)/, (res) => {
    const roomId = res.message.room;

    if (!state[roomId] || !state[roomId].waitingForBreed) {
      return; // 画像解析後に対話を開始する状態でない場合は何もしない
    }

    builder.build((err, tokenizer) => {
      if (err) {
        console.log("error:" + err);
        return;
      }

      const tokens = tokenizer.tokenize(res.match[1]); // 入力されたメッセージを形態素解析する
      let nouns = [];
      let verbs = [];
      let adjectives = [];
      tokens.forEach((e) => {
        if (e.pos ==='名詞') {
            nouns.push(e.surface_form);
          } else if (e.pos === '動詞') {
            verbs.push(e.basic_form);
          }else if (e.pos == '形容詞') {
            adjectives.push(e.basic_form);
          }
        });
  
        if (nouns.length > 0 || verbs.length > 0 || adjectives.length > 0) {
          let responseMessage = '';
  
          if (verbs.length > 0) {
            responseMessage = `えっ、${verbs[0]}つもり？`;
          } else if (nouns.length > 0) {
            responseMessage = `なるほど、${nouns[0]}だよね。可愛い！！！`;
          } else if (adjectives.length > 0) {
            responseMessage = `確かに、${adjectives[0]}よね。`;
          } else {
            responseMessage = '何をおっしゃっているの分からないよ。';
          }
  
          res.send(responseMessage);
        } else {
          res.send('何を言っているのか分からないよ');
        }
  

      });
    });
  };
  