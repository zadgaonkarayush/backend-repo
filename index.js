const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const sendGridMail = require('@sendgrid/mail');
const fs = require('fs');

const corsOption = {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
app.use(express.json());
app.use(cors(corsOption));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));


sendGridMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY);

const con = mysql.createConnection({
   host: 'autorack.proxy.rlwy.net',    // Railway database host
  port: 59875,                        // Railway database port
  user: 'root',                       // Railway database username
  password: 'AQzPCiOiHpqqKFjMRVDiMscKhbgyhrNL', // Railway database password
  database: 'railway'
});
con.connect((err) => {
  if (err) {
    console.log('Not Connected to Database !');
    return;
  } else {
    console.log('Connected to database');
  }
});

const SECRET_KEY = 'my_secret_key';

app.post('/register', (req, res) => {
  const { firstname, lastname, email, mobile, password } = req.body;
  const sql = "INSERT INTO users (firstname,lastname,email,mobile,password) VALUES(?,?,?,?,?)";

  bcrypt.hash(password, 10, (err, hashPassword) => {
    if (err) {
      return res.json({ Status: false, Error: "Error in hashing Password" });
    }
    con.query(sql, [firstname, lastname, email, mobile, hashPassword], (err, result) => {
      if (err) return res.json({ Status: false, Error: "Query Error" });

      const token = jwt.sign(
        { role: 'user', email: email, id: result.insertId },
        SECRET_KEY,
        { expiresIn: '1h' }
      );

      return res.json({ Status: true, Result: result, token });
    });
  });
});
app.post('/login', (req, res) => {
  console.log('Reques received');

  const { email, password } = req.body;
  const sql = 'SELECT* FROM users WHERE email=?';

  con.query(sql, [email], (err, result) => {
    if (err) return res.json({ Status: false, Error: 'Query insertion Error' });
    if (result.length === 0) {
      return res.json({ Status: false, Error: 'User not found' });
    }
    bcrypt.compare(password, result[0].password, (err, isMatch) => {
      if (err) return res.json({ Status: false, Error: 'Error in Password comparison' });

      if (!isMatch) return res.json({ Status: false, Error: 'Incorrect Password' });

      const token = jwt.sign(
        { id: result[0].id, email: result[0].email },
        SECRET_KEY,
        { expiresIn: '1h' }
      );
      return res.json({
        Status: true,
        token: token,
        UserId: result[0].id,
      })
    });
  });
});
app.post('/forgot', (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(1000 + Math.random() * 9000);
  const sql1 = 'SELECT* FROM users Where email =?';
  try {
    con.query(sql1, [email], (err, result) => {
      if (err) return res.json({ Status: false, Error: 'database query insertion error' });

      if (result.length === 0) return res.json({ Status: false, Error: 'User not found' });

      const sql2 = 'UPDATE users SET otp=? WHERE email=?';
      con.query(sql2, [otp, email], (err, Updateresult) => {
        if (err) return res.json({ Status: false, Error: 'database query insertion error' });

        const msg = {
          to: email,
          from: process.env.SENDGRID_VERIFIED_SENDER,
          subject: 'Your Otp Code',
          text: `Your Otp Code is ${otp}`,
        };
        sendGridMail.send(msg);
        res.json({ Status: true, message: 'Otp sent' });
      })


    })
  } catch (err) {
    console.log(err);
    res.json({ Status: false, Error: 'Error sending Otp' });
  }

})
app.post('/otp', (req, res) => {
  const { email, otp } = req.body;
  const sql = 'SELECT otp FROM users WHERE email=?';

  con.query(sql, [email], (err, result) => {
    if (err) return res.json({ Status: false, Error: 'database query insertion error' });

    if (result.length === 0) return res.json({ Status: false, Error: 'User not found' });

    const storedOtp = result[0].otp;

    if (storedOtp == otp) {
      return res.json({ Status: true });
    } else {
      return res.json({ Status: false, Error: 'Invalid otp' });
    }
  })
})
app.post('/reset', (req, res) => {
  const { email, password } = req.body;
  bcrypt.hash(password, 10, (err, hashPassword) => {
    if (err) return res.json({ success: false, message: 'Hashing Error' });
    const sql = 'UPDATE users set password = ? WHERE email=?';
    con.query(sql, [hashPassword, email], (err, result) => {
      if (err) return res.json({ success: false, message: 'Password changing Error' });
      return res.json({ success: true, message: 'Password reset successfully' });

    })
  })

})
app.get('/viewprofile/:id', (req, res) => {
  const userId = req.params.id;

  const sql = "SELECT firstname, lastname, email, mobile FROM users WHERE id = ?";

  con.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Query Error:", err);
      return res.json({ Status: false, Error: "Query Error" });
    }


    return res.json({ Status: true, Result: result[0] });

  });
});

app.put('/editprofile/:id', (req, res) => {
  const id = req.params.id;
  const updates = [];
  const values = [];


  if (req.body.firstname) {
    updates.push("firstname=?");
    values.push(req.body.firstname);
  }
  if (req.body.firstname) {
    updates.push("lastname=?");
    values.push(req.body.lastname);
  }
  if (req.body.email) {
    updates.push("email=?");
    values.push(req.body.email);
  }
  if (req.body.mobile) {
    updates.push("mobile=?");
    values.push(req.body.mobile);
  }
  values.push(id);

  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id=?`;

  con.query(sql, values, (err, result) => {
    if (err) return res.json({ Status: false, Error: "Query Error" });
    return res.json({ Status: true, Result: result });
  });
});

// const storage = multer.diskStorage({
//     destination:(req,file,cb) =>{
//         cb(null,path.join(__dirname,'Public/uploads'));
//     },
//     filename:(req,file,cb)=>{
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     cb(null, `${uniqueSuffix}-${file.originalname}`);
//     },
// });

// const upload = multer({storage});


// app.post('/add-plant', upload.single('image'),(req, res) => {
//     console.log('Request of add plant received');
//     console.log("Body:", req.body);

//     console.log("File:", req.file);

//     const { plantName, description, category, location } = req.body;
//     const image = req.file ? `/uploads/${req.file.filename}` : null;

//     if (!plantName || !description || !category || !location || !image) {
//       return res.status(400).json({ error: 'All fields are required.' });
//     }

//     const query = 'INSERT INTO plants (plantName, description, category, location,image) VALUES (?, ?, ?, ?,?)';
//     const values = [plantName, description, category, location,image];

//     con.query(query, values, (err, result) => {
//       if (err) {
//         console.error('Error inserting plant data:', err);
//         return res.status(500).json({ error: 'Database error.' });
//       }
//       res.status(200).json({ message: 'Plant added successfully!', data: result });
//     });
//   });


//   app.use('/uploads', express.static(path.join(__dirname, 'Public', 'uploads')));


// Serve the uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'Public', 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`;
    cb(null, uniqueSuffix);
  },
});

const upload = multer({ storage });

// Handle POST request for adding a plant
app.post('/add-plant', upload.single('image'), async (req, res) => {
  console.log('Request body:', req.body); // Check the body contents
  console.log('Uploaded file:', req.file); // Check the uploaded file details

  const { plantName, description, category, location, imageUri } = req.body;
  let imagePath = null;

  if (req.file) {
    imagePath = `/uploads/${req.file.filename}`;
  } else if (imageUri) {
    const base64Data = imageUri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${Date.now()}-image.png`;
    const uploadPath = path.join(__dirname, 'Public', 'uploads', fileName);

    try {
      await fs.promises.writeFile(uploadPath, buffer);
      imagePath = `/uploads/${fileName}`;
    } catch (err) {
      console.error('Error saving image from URI:', err);
      return res.status(500).json({ error: 'Error saving image from URI.' });
    }
  }

  if (!plantName || !description || !category || !location || !imagePath) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const query = 'INSERT INTO plants (plantName, description, category, location, image) VALUES (?, ?, ?, ?, ?)';
  const values = [plantName, description, category, location, imagePath];

  con.query(query, values, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    res.status(200).json({ message: 'Plant added successfully!', data: result });
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'Public', 'uploads')));

app.post("/logout", (req, res) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(400).json({
      Status: false,
      Error: "No token provided or invalid format",
    });
  }

  const token = authHeader.split(" ")[1]; // Extract the token

  // Optional: Blacklist the token if necessary
  // Your token invalidation logic here

  res.status(200).json({
    Status: true,
    Message: "Logged out successfully",
  });
});
app.delete('/deleteaccount/:id', (req, res) => {
  const userId = req.params.id;

  const sql = 'DELETE FROM users WHERE id = ?';
  con.query(sql, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ Status: false, Error: 'Failed to delete user' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ Status: false, Error: 'User not found' });
    }
    res.status(200).json({ Status: true, Message: 'User account deleted successfully' });
  });
});
app.get('/plant_records', (req, res) => {
  const sql = "SELECT id,plantname,description,image FROM plants LIMIT 8";

  con.query(sql, (err, result) => {
    if (err) return res.json({ Status: false, Error: "Query Error" });
    return res.json({ Status: true, Result: result });
  });
});
app.get('/plant_count', (req, res) => {
  const sql = "SELECT count(id) as plant from plants";
  con.query(sql, (err, result) => {
    if (err) return res.json({ Status: false, Error: "Query Error" });
    return res.json({ Status: true, Result: result[0].plant });
  });
});
app.get('/plant_fullrecords', (req, res) => {
  const sql = "SELECT id,plantname,description,image,category FROM plants";

  con.query(sql, (err, result) => {
    if (err) return res.json({ Status: false, Error: "Query Error" });
    return res.json({ Status: true, Result: result });
  });
});
app.get('/plant_detail/:id', (req, res) => {
  const id = req.params.id;
  con.query('SELECT * FROM plants WHERE id = ?', [id], (err, results) => {
      if (err) {
          return res.status(500).json({ Status: false, Error: err.message });
      }
      if (results.length === 0) {
          return res.status(404).json({ Status: false, Error: 'Plant not found' });
      }
      res.json({ Result: results[0] });
  });
});

app.post('/wishlist', (req, res) => {
  const { id, plantId } = req.body;
  const checkquery = "SELECT* FROM wishlist WHERE user_id =? AND plant_id =?";
  con.query(checkquery, [id, plantId], (err, result) => {
      if (err) return res.json({ Status: false, Error: 'Query Error' });

      if (result.length > 0) {
          //plant already in the wishlist remove it
          const removeQuery = 'DELETE FROM wishlist  WHERE user_id =? AND plant_id = ?';
          con.query(removeQuery, [id, plantId], (err, result) => {
              if (err) return res.json({ Status: false, Error: 'Query Erro' })
              return res.json({ Status: true });
          });
      } else {
          //Add plant to  the wishlist
          const Addquery = 'INSERT INTO wishlist (user_id,plant_id) VALUES(?,?)';
          con.query(Addquery, [id, plantId], (err, result) => {
              if (err) return res.json({ Status: false, Error: 'Query Error' })
              return res.json({ Status: true });
          });
      }
  })
}) 
app.get('/wishlist/:id', (req, res) => {
  const id = req.params.id;
  const sql = `SELECT p.id,p.plantname,p.description,p.image
  FROM wishlist w
  JOIN plants p ON w.plant_id= p.id
  WHERE w.user_id=?`;

  con.query(sql, [id], (err, result) => {
      if (err) return res.json({ Status: false, Error: 'Query Error' })
      return res.json({ Status: true, Result: result });
  });
});


app.put('/changepassword/:id', (req, res) => {
  const id = req.params.id;
  const { previousPassword, newPassword } = req.body;

  console.log('Changing password for ID:', id);
  console.log('Previous Password:', previousPassword);
  console.log('New Password:', newPassword);

  // Query to get the current password
  con.query('SELECT password FROM users WHERE id = ?', [id], (err, results) => {
      if (err) {
          console.error('Query Error:', err);
          return res.json({ Status: false, Error: 'Error executing query.' });
      }

      if (results.length === 0) {
          return res.json({ Status: false, Error: 'User not found.' });
      }

      const user = results[0];
      bcrypt.compare(previousPassword, user.password, (err, isMatch) => {
          if (err) {
              console.error('Error in Password comparison:', err);
              return res.json({ Status: false, Error: 'Error comparing passwords.' });
          }

          if (!isMatch) {
              return res.json({ Status: false, Error: 'Previous Password is incorrect.' });
          }

          // Hash the new password
          bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
              if (err) {
                  console.error('Error in hashing new password:', err);
                  return res.json({ Status: false, Error: 'Error hashing new password.' });
              }

              // Update the password
              con.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id], (err, result) => {
                  if (err) {
                      console.error('Query Error:', err);
                      return res.json({ Status: false, Error: 'Error updating password.' });
                  }

                  return res.json({ Status: true, Result: result });
              });
          });
      });
  });
});
const port = 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on Port ${port}`);
})
