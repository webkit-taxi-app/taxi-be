var express = require("express");
var router = express.Router();
const db = require("../database/db_connect");
const admin = require("firebase-admin");

router.get("/taxi/test", function (req, res, next) {
  db.query("SELECT * FROM tb_user", (err, rows, fields) => {
    if (!err) {
      console.log("test / rows = " + JSON.stringify(rows));
      res.json({ code: 0, data: rows });
    } else {
      console.log("test / err: " + err);
      res.json({ code: 1, data: err });
    }
  });
});

// Login
router.post("/taxi/login", function (req, res, next) {
  console.log("login / req.body " + JSON.stringify(req.body));

  let userId = req.body.userId;
  let userPw = req.body.userPw;
  let fcmToken = req.body.fcmToken || "";

  // Prepared Statements 사용으로 보안 강화
  let queryStr = `SELECT * FROM tb_user WHERE user_id = ? AND user_pw = ?`;
  console.log("login / queryStr = " + queryStr);

  db.query(queryStr, [userId, userPw], (err, rows, fields) => {
    if (!err) {
      console.log("login / rows = " + JSON.stringify(rows));
      let len = Object.keys(rows).length;
      console.log("login / len = " + len);

      let code = len == 0 ? 1 : 0;
      let message =
        len == 0
          ? "아이디 또는 비밀번호가 잘못 입력되었습니다."
          : "로그인 성공";

      if (code == 0) {
        updateFcm(fcmToken, "tb_user", "user_id", userId);
      }

      res.json({ code: code, message: message });
    } else {
      console.log("login / err: " + err);
      res.json({ code: 1, message: "로그인 중 오류가 발생했습니다." });
    }
  });
});

// 회원가입
router.post("/taxi/register", function (req, res) {
  console.log("register / req.body " + JSON.stringify(req.body));

  let userId = req.body.userId;
  let userPw = req.body.userPw;
  let fcmToken = req.body.fcmToken || "";

  console.log("register / userId = " + userId + ", userPw = " + userPw);

  if (!(userId && userPw)) {
    return res.json({ code: 1, message: "아이디 또는 비밀번호가 없습니다." });
  }

  let queryStr = `INSERT INTO tb_user (user_id, user_pw, fcm_token) VALUES (?, ?, '${fcmToken}')`;
  console.log("register / queryStr = " + queryStr);

  db.query(queryStr, [userId, userPw], function (err, rows, fields) {
    if (!err) {
      console.log("register / rows = " + JSON.stringify(rows));
      res.json({ code: 0, message: "회원가입이 완료되었습니다." });
    } else {
      console.log("register / err : " + JSON.stringify(err));
      if (err.code == "ER_DUP_ENTRY") {
        res.json({ code: 2, message: "이미 등록된 ID 입니다.", data: err });
      } else {
        res.json({
          code: 3,
          message: "알 수 없는 오류가 발생하였습니다.",
          data: err,
        });
      }
    }
  });
});

// call list
router.post("/taxi/list", function (req, res) {
  console.log("list / req.body " + JSON.stringify(req.body));
  let userId = req.body.userId;
  console.log("list / userId = " + userId);

  let queryStr = `SELECT * FROM tb_call WHERE user_id = ? ORDER BY id DESC`;
  console.log("list / queryStr = " + queryStr);

  db.query(queryStr, [userId], function (err, rows, fields) {
    if (!err) {
      console.log("list / rows = " + JSON.stringify(rows));
      res.json({ code: 0, message: "택시 호출 목록 호출 성공", data: rows });
    } else {
      console.log("err : " + err);
      res.json({
        code: 1,
        message: "알 수 없는 오류가 발생하였습니다.",
        data: err,
      });
    }
  });
});

// 택시 호출
router.post("/taxi/call", function (req, res) {
  console.log("call / req.body " + JSON.stringify(req.body));

  const userId = req.body.userId;
  const startAddr = req.body.startAddr;
  const startLat = req.body.startLat;
  const startLng = req.body.startLng;
  const endAddr = req.body.endAddr;
  const endLat = req.body.endLat;
  const endLng = req.body.endLng;

  // 필수 정보가 하나라도 없으면 실패 리턴
  if (
    !(
      userId &&
      startAddr &&
      startLat &&
      startLng &&
      endAddr &&
      endLat &&
      endLng
    )
  ) {
    return res.json({
      code: 1,
      message: "출발지 또는 도착지 정보가 없습니다.",
    });
  }

  const queryStr = `INSERT INTO tb_call (user_id, start_lat, start_lng, start_addr, end_lat, end_lng, end_addr, fcm_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?, '')`;

  console.log("call / queryStr = " + queryStr);

  db.query(
    queryStr,
    [userId, startLat, startLng, startAddr, endLat, endLng, endAddr],
    function (err, rows, fields) {
      if (!err) {
        console.log("call / rows = " + JSON.stringify(rows));
        //Driver 앱에 푸시 전송
        sendPushToAllDriver();
        res.json({ code: 0, message: "택시 호출이 완료되었습니다." });
      } else {
        console.log("call / err : " + JSON.stringify(err));
        res.json({ code: 2, message: "택시 호출이 실패했습니다.", data: err });
      }
    }
  );

  // 모든 Driver에게 메시시 전송
  const sendPushToAllDriver = () => {
    let queryStr = "SELECT fcm_token FROM tb_driver";
    console.log(">> querystr = " + queryStr);
    db.query(queryStr, function (err, rows, fields) {
      if (!err) {
        for (row of rows) {
          console.log("allDriver - fcm_token = " + row.fcm_token);
          if (row.fcm_token) {
            sendFcm(row.fcm_token, "배차 요청이 있습니다");
          }
        }
      } else {
        console.log("allDriver - err : " + err);
      }
    });
  };
});

// Driver - 회원가입
router.post("/driver/register", function (req, res) {
  console.log("driver-register / req.body " + JSON.stringify(req.body));

  let userId = req.body.userId;
  let userPw = req.body.userPw;
  let fcmToken = req.body.fcmToken || "";

  console.log("driver-register / userId = " + userId + ", userPw = " + userPw);

  // id, pw 둘 중 하나라도 없으면 실패 리턴
  if (!(userId && userPw)) {
    return res.json({ code: 1, message: "아이디 또는 비밀번호가 없습니다." });
  }

  // Prepared Statements로 SQL 인젝션 방지
  let queryStr = `INSERT INTO tb_driver (user_id, user_pw, fcm_token) VALUES (?, ?, '${fcmToken}')`;
  console.log("driver-register / queryStr = " + queryStr);

  db.query(queryStr, [userId, userPw], function (err, rows, fields) {
    if (!err) {
      console.log("driver-register / rows = " + JSON.stringify(rows));
      res.json({ code: 0, message: "회원가입이 완료되었습니다." });
    } else {
      console.log("driver-register / err : " + JSON.stringify(err));
      if (err.code == "ER_DUP_ENTRY") {
        res.json({ code: 2, message: "이미 등록된 ID 입니다.", data: err });
      } else {
        res.json({
          code: 3,
          message: "알 수 없는 오류가 발생하였습니다.",
          data: err,
        });
      }
    }
  });
});

// Driver - Login
router.post("/driver/login", function (req, res, next) {
  console.log("driver-login / req.body " + JSON.stringify(req.body));

  let userId = req.body.userId;
  let userPw = req.body.userPw;
  let fcmToken = req.body.fcmToken || "";

  // SQL 쿼리에서 Prepared Statements 사용
  let queryStr = `SELECT * FROM tb_driver WHERE driver_pw = ? AND driver_pw = ?`;
  console.log("driver-login / queryStr = " + queryStr);

  db.query(queryStr, [userId, userPw], (err, rows, fields) => {
    if (!err) {
      console.log("driver-login / rows = " + JSON.stringify(rows));
      let len = rows.length; // Object.keys(rows).length 대신 rows.length 사용
      console.log("driver-login / len = " + len);

      let code = len == 0 ? 1 : 0;
      let message =
        len == 0
          ? "아이디 또는 비밀번호가 잘못 입력되었습니다."
          : "로그인 성공";

      if (code == 0) {
        updateFcm(fcmToken, "tb_driver", "driver_id", userId);
      }

      res.json({ code: code, message: message, data: rows }); // 데이터도 응답에 추가
    } else {
      console.log("driver-login / err: " + err);
      res.json({ code: 1, message: "로그인 중 오류가 발생했습니다." });
    }
  });
});

// Driver - call list
router.post("/driver/list", function (req, res) {
  console.log("driver-list / req.body " + JSON.stringify(req.body));

  let userId = req.body.userId;
  console.log("driver-list / userId = " + userId);

  // Prepared Statements를 사용하여 보안을 강화함
  let queryStr = `SELECT * FROM tb_call WHERE driver_id = ? OR call_state = 'REQ' ORDER BY id DESC`;
  console.log("driver-list / queryStr = " + queryStr);

  db.query(queryStr, [userId], function (err, rows, fields) {
    if (!err) {
      console.log("driver-list / rows = " + JSON.stringify(rows));
      let code = 0;
      res.json({ code: code, message: "택시 호출 목록 호출 성공", data: rows });
    } else {
      console.log("driver-list / err : " + err);
      res.json({
        code: 1,
        message: "알 수 없는 오류가 발생하였습니다.",
        data: err,
      });
    }
  });
});

// Driver - 배차
router.post("/driver/accept", function (req, res) {
  console.log("driver-accept / req.body " + JSON.stringify(req.body));

  let callId = req.body.callId;
  let driverId = req.body.driverId;
  let userId = req.body.userId || "";

  console.log(
    "driver-accept / callId = " + callId + ", driverId = " + driverId
  );

  // callId, driverId 둘 중 하나라도 없으면 실패 리턴.
  if (!(callId && driverId)) {
    return res.json({ code: 1, message: "callId 또는 driverId가 없습니다." });
  }

  // Prepared Statements를 사용하여 SQL 인젝션 방지
  let queryStr = `UPDATE tb_call SET driver_id = ?, call_state = 'RES' WHERE id = ?`;

  console.log("driver-accept / queryStr = " + queryStr);

  db.query(queryStr, [driverId, callId], function (err, rows, fields) {
    if (!err) {
      console.log("driver-accept / rows = " + JSON.stringify(rows));

      // affectedRows가 0보다 크면 성공적으로 업데이트된 것임
      if (rows.affectedRows > 0) {
        return res.json({ code: 0, message: "배차가 완료되었습니다." });
      } else {
        return res.json({
          code: 2,
          message: "이미 완료되었거나 없는 Call입니다.",
        });
      }
    } else {
      console.log("driver-accept / err : " + JSON.stringify(err));
      return res.json({
        code: 3,
        message: "알 수 없는 오류가 발생하였습니다.",
        data: err,
      });
    }
  });
});

// push - test
router.post("/push/test", async function (req, res, next) {
  console.log("push-test / req.body " + JSON.stringify(req.body));

  let fcmToken = req.body.fcmToken;
  let message = req.body.message;

  // FCM 전송 함수 호출
  try {
    await sendFcm(fcmToken, message);
    res.json({ code: 0, message: "푸시 테스트 성공" });
  } catch (error) {
    console.error("푸시 테스트 중 오류 발생: ", error);
    res.json({ code: 1, message: "푸시 테스트 실패", error: error });
  }
});

// FCM 전송 함수
const sendFcm = async (fcmToken, msg) => {
  const message = {
    notification: { title: "알림", body: msg },
    token: fcmToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("-- push 성공, response: ", response);
  } catch (error) {
    console.error("-- push 실패, error: ", error);
    throw error;
  }
};

const updateFcm = (fcmToken, table, idColName, id) => {
  const queryStr = `UPDATE ${table} SET fcm_token=”${fcmToken}” WHERE
  ${idColName}=”${id}”`;
  console.log(">>>> updateFcm / queryStr = " + queryStr);
  db.query(queryStr, function (err, rows, fields) {
    if (err) {
      console.log("register / err : " + JSON.stringify(err));
    }
  });
};

// 모든 Driver에게 메시시 전송
const sendPushToAllDriver = () => {
  let queryStr = "SELECT fcm_token FROM tb_driver";
  console.log(">> querystr = " + queryStr);
  db.query(queryStr, function (err, rows, fields) {
    if (!err) {
      for (row of rows) {
        console.log("allDriver - fcm_token = " + row.fcm_token);
        if (row.fcm_token) {
          sendFcm(row.fcm_token, "배차 요청이 있습니다");
        }
      }
    } else {
      console.log("allDriver - err : " + err);
    }
  });
};

module.exports = router;
